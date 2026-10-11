const fs = require('fs');
const path = require('path');
const {
  EVENT_ROUNDS,
  ROUND_TIME_LIMIT,
  REVEAL_DURATION_SECONDS,
  PREP_COUNTDOWN_SECONDS,
  UNSOLVED_PENALTY,
  WRONG_ATTEMPT_PENALTY,
  HINT_PENALTY,
  DISCONNECT_GRACE_PERIOD_MS,
  DEFAULT_MAX_CONCURRENT_TEAMS,
  MIN_CONCURRENT_TEAMS,
  MAX_CONCURRENT_TEAMS,
  TEAM_NAME_MAX_LENGTH,
} = require('./config/eventConfig');

const EVENT_DATA_PATH = path.join(__dirname, 'data', 'eventData.json');

// In-memory state
let currentEvent = null;
let eventPool = []; // exactly 3 challenges with same clue count
let activeTeams = new Set(); // roomIds currently running rounds
let queuedTeams = []; // [{ roomId, teamName, queuedAt }]
let teamKeywordOrders = new Map(); // roomId -> array of 3 challenge objects
let teamRunResults = new Map(); // roomId -> run result object
let leaderboard = []; // sorted complete & incomplete runs
let tickerHistory = []; // recent event highlights
let disconnectTimers = new Map(); // roomId -> setTimeout id

// Persistence helper
function saveEventState() {
  try {
    const data = {
      currentEvent,
      eventPool,
      leaderboard,
      tickerHistory: tickerHistory.slice(-20),
    };
    fs.writeFileSync(EVENT_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save event data:', err);
  }
}

function loadEventState() {
  try {
    if (fs.existsSync(EVENT_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(EVENT_DATA_PATH, 'utf8'));
      currentEvent = data.currentEvent || null;
      eventPool = data.eventPool || [];
      leaderboard = data.leaderboard || [];
      tickerHistory = data.tickerHistory || [];
    }
  } catch (err) {
    console.error('Failed to load event data:', err);
  }
}

loadEventState();

function sanitizeTeamName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[<>'"]/g, '').trim().slice(0, TEAM_NAME_MAX_LENGTH);
}

function formatTime(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

class EventManager {
  getEvent() {
    return currentEvent;
  }

  isLive() {
    return currentEvent && currentEvent.status === 'live';
  }

  getPool() {
    return eventPool;
  }

  getSlotUsage() {
    const max = currentEvent?.maxConcurrentTeams || DEFAULT_MAX_CONCURRENT_TEAMS;
    const active = activeTeams.size;
    const waiting = queuedTeams.length;
    return {
      activeCount: active,
      maxConcurrentTeams: max,
      waitingCount: waiting,
      formatted: `Slots ${active}/${max} in use, ${waiting} team${waiting === 1 ? '' : 's'} waiting`,
    };
  }

  createEvent({ name, maxConcurrentTeams, category = 'Mixed', prizeBanner = 'Top 3 teams win prizes' }) {
    const parsedMax = parseInt(maxConcurrentTeams, 10);
    if (isNaN(parsedMax) || parsedMax < MIN_CONCURRENT_TEAMS || parsedMax > MAX_CONCURRENT_TEAMS) {
      throw new Error(`maxConcurrentTeams must be between ${MIN_CONCURRENT_TEAMS} and ${MAX_CONCURRENT_TEAMS}`);
    }

    currentEvent = {
      id: `evt_${Date.now()}`,
      name: (name || 'Championship Race').trim(),
      maxConcurrentTeams: parsedMax,
      category: category || 'Mixed',
      prizeBanner: (prizeBanner || 'Top 3 teams win prizes').trim(),
      status: 'draft', // draft, live, closed
      createdAt: Date.now(),
      rounds: EVENT_ROUNDS,
    };

    eventPool = [];
    activeTeams.clear();
    queuedTeams = [];
    teamKeywordOrders.clear();
    teamRunResults.clear();
    leaderboard = [];
    tickerHistory = [];
    disconnectTimers.forEach(t => clearTimeout(t));
    disconnectTimers.clear();

    saveEventState();
    return currentEvent;
  }

  openEvent(challengesData) {
    if (!currentEvent) {
      throw new Error('No event created yet. Please create an event first.');
    }

    const max = currentEvent.maxConcurrentTeams;
    if (!max || max < MIN_CONCURRENT_TEAMS || max > MAX_CONCURRENT_TEAMS) {
      throw new Error(`maxConcurrentTeams must be set between ${MIN_CONCURRENT_TEAMS} and ${MAX_CONCURRENT_TEAMS} before going live.`);
    }

    // Build the fair pool of exactly 3 keywords with identical clue count
    const pool = this.buildFairPool(challengesData, currentEvent.category);
    if (!pool || pool.length !== EVENT_ROUNDS) {
      throw new Error(`Dataset could not provide exactly ${EVENT_ROUNDS} keywords with identical clue counts for category "${currentEvent.category}".`);
    }

    eventPool = pool;
    currentEvent.status = 'live';
    currentEvent.openedAt = Date.now();

    saveEventState();
    return currentEvent;
  }

  buildFairPool(challengesData, categoryFilter) {
    if (!Array.isArray(challengesData) || challengesData.length < EVENT_ROUNDS) {
      return null;
    }

    let candidates = challengesData.filter(c => Array.isArray(c.clues) && c.clues.length > 0);

    if (categoryFilter && categoryFilter !== 'Mixed' && categoryFilter !== 'Random') {
      candidates = candidates.filter(c => c.category === categoryFilter);
    }

    if (candidates.length < EVENT_ROUNDS) {
      return null;
    }

    // Group candidates by clue count
    const byClueCount = new Map();
    candidates.forEach(c => {
      const count = c.clues.length;
      if (!byClueCount.has(count)) byClueCount.set(count, []);
      byClueCount.get(count).push(c);
    });

    // Find clue counts that have at least EVENT_ROUNDS challenges
    const eligibleCounts = Array.from(byClueCount.keys())
      .filter(count => byClueCount.get(count).length >= EVENT_ROUNDS)
      .sort((a, b) => b - a); // prefer higher clue count (e.g. 4 or 8)

    if (eligibleCounts.length === 0) {
      return null;
    }

    // For Mixed: find a clue count that spans at least EVENT_ROUNDS distinct categories
    if (categoryFilter === 'Mixed' || !categoryFilter) {
      for (const count of eligibleCounts) {
        const group = byClueCount.get(count);
        const byCat = new Map();
        group.forEach(c => {
          if (!byCat.has(c.category)) byCat.set(c.category, []);
          byCat.get(c.category).push(c);
        });

        const availableCats = Array.from(byCat.keys());
        if (availableCats.length >= EVENT_ROUNDS) {
          const shuffledCats = [...availableCats].sort(() => 0.5 - Math.random());
          const chosen = [];
          for (let i = 0; i < EVENT_ROUNDS; i++) {
            const catChallenges = byCat.get(shuffledCats[i]);
            chosen.push(catChallenges[Math.floor(Math.random() * catChallenges.length)]);
          }
          return chosen;
        }
      }
    }

    // Default or single-category fallback: pick from the best eligible count
    const bestCount = eligibleCounts[0];
    const group = byClueCount.get(bestCount);
    const shuffled = [...group].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, EVENT_ROUNDS);
  }

  closeEvent() {
    if (!currentEvent) throw new Error('No event to close');
    currentEvent.status = 'closed';
    currentEvent.closedAt = Date.now();
    activeTeams.clear();
    queuedTeams = [];
    saveEventState();
    return currentEvent;
  }

  resetEvent() {
    currentEvent = null;
    eventPool = [];
    activeTeams.clear();
    queuedTeams = [];
    teamKeywordOrders.clear();
    teamRunResults.clear();
    leaderboard = [];
    tickerHistory = [];
    disconnectTimers.forEach(t => clearTimeout(t));
    disconnectTimers.clear();
    saveEventState();
    return { success: true, message: 'Event reset successfully' };
  }

  updateSettings({ maxConcurrentTeams, prizeBanner }) {
    if (!currentEvent) throw new Error('No active event');
    if (maxConcurrentTeams !== undefined) {
      const parsed = parseInt(maxConcurrentTeams, 10);
      if (isNaN(parsed) || parsed < MIN_CONCURRENT_TEAMS || parsed > MAX_CONCURRENT_TEAMS) {
        throw new Error(`maxConcurrentTeams must be between ${MIN_CONCURRENT_TEAMS} and ${MAX_CONCURRENT_TEAMS}`);
      }
      currentEvent.maxConcurrentTeams = parsed;
    }
    if (prizeBanner !== undefined) {
      currentEvent.prizeBanner = String(prizeBanner).trim();
    }
    saveEventState();
    return currentEvent;
  }

  // Check if team name already had a scored run in current event
  isTeamNameUsed(teamName) {
    const clean = sanitizeTeamName(teamName).toLowerCase();
    if (!clean) return false;
    return leaderboard.some(entry => entry.teamName.toLowerCase() === clean && !entry.isPractice);
  }

  // Register an event room and assign shuffled keywords
  registerTeamRoom(roomId, teamName) {
    const cleanName = sanitizeTeamName(teamName);
    const isPractice = this.isTeamNameUsed(cleanName);

    // Shuffle the 3 keywords specifically for this team
    const shuffledPool = [...eventPool].sort(() => 0.5 - Math.random());
    teamKeywordOrders.set(roomId, shuffledPool);

    const initialResult = {
      roomId,
      teamName: cleanName,
      isPractice,
      members: [],
      teamSize: 0,
      rounds: [], // { roundNum, answer, solved, roundSeconds, wrongAttempts, hintsUsed, roundTime }
      totalTime: 0,
      totalWrong: 0,
      totalHints: 0,
      roundsSolved: 0,
      status: 'pending', // pending, queued, active, completed, incomplete
      startedAt: null,
      completedAt: null,
    };

    teamRunResults.set(roomId, initialResult);
    return { teamName: cleanName, isPractice };
  }

  getTeamKeywordForRound(roomId, roundNumber) {
    const order = teamKeywordOrders.get(roomId);
    if (!order || !order[roundNumber - 1]) return null;
    return order[roundNumber - 1];
  }

  canStartTeamImmediately() {
    if (!this.isLive()) return false;
    const max = currentEvent.maxConcurrentTeams || DEFAULT_MAX_CONCURRENT_TEAMS;
    return activeTeams.size < max;
  }

  activateTeam(roomId) {
    activeTeams.add(roomId);
    // Remove from queue if it was in queue
    queuedTeams = queuedTeams.filter(q => q.roomId !== roomId);
    const run = teamRunResults.get(roomId);
    if (run) {
      run.status = 'active';
      if (!run.startedAt) run.startedAt = Date.now();
    }
    this.clearDisconnectTimer(roomId);
    return true;
  }

  enqueueTeam(roomId, teamName) {
    if (!queuedTeams.some(q => q.roomId === roomId)) {
      queuedTeams.push({
        roomId,
        teamName: sanitizeTeamName(teamName),
        queuedAt: Date.now(),
      });
    }
    const run = teamRunResults.get(roomId);
    if (run) run.status = 'queued';
    return this.getQueuePosition(roomId);
  }

  getQueuePosition(roomId) {
    const idx = queuedTeams.findIndex(q => q.roomId === roomId);
    return idx >= 0 ? idx + 1 : 0;
  }

  removeFromQueue(roomId) {
    queuedTeams = queuedTeams.filter(q => q.roomId !== roomId);
  }

  getNextQueuedTeam() {
    if (queuedTeams.length === 0) return null;
    return queuedTeams.shift();
  }

  // Free slot when team completes round 3 or is marked incomplete
  releaseTeamSlot(roomId) {
    activeTeams.delete(roomId);
    this.clearDisconnectTimer(roomId);
  }

  // Disconnect handling
  handleTeamDisconnect(roomId, onTimeoutCallback) {
    this.clearDisconnectTimer(roomId);

    const timer = setTimeout(() => {
      disconnectTimers.delete(roomId);

      // Check if team was in queue
      if (queuedTeams.some(q => q.roomId === roomId)) {
        this.removeFromQueue(roomId);
        if (onTimeoutCallback) onTimeoutCallback('queue_removed', roomId);
        return;
      }

      // Check if team was active
      if (activeTeams.has(roomId)) {
        const run = teamRunResults.get(roomId);
        if (run && run.status === 'active') {
          run.status = 'incomplete';
          run.completedAt = Date.now();
          this.releaseTeamSlot(roomId);
          this.updateLeaderboard(run);
          if (onTimeoutCallback) onTimeoutCallback('active_incomplete', roomId);
        }
      }
    }, DISCONNECT_GRACE_PERIOD_MS);

    disconnectTimers.set(roomId, timer);
  }

  handleTeamReconnect(roomId) {
    this.clearDisconnectTimer(roomId);
  }

  clearDisconnectTimer(roomId) {
    if (disconnectTimers.has(roomId)) {
      clearTimeout(disconnectTimers.get(roomId));
      disconnectTimers.delete(roomId);
    }
  }

  markTeamIncomplete(roomId, reason = 'forfeit') {
    const run = teamRunResults.get(roomId);
    if (!run) return null;
    run.status = 'incomplete';
    run.completedAt = Date.now();
    run.incompleteReason = reason;
    this.releaseTeamSlot(roomId);
    const rankInfo = this.updateLeaderboard(run);
    saveEventState();
    return { ...run, ...rankInfo };
  }

  // Record round result
  recordRoundResult(roomId, roundNum, { answer, solved, secondsUsed, wrongAttempts, hintsUsed }) {
    const run = teamRunResults.get(roomId);
    if (!run) return null;

    let baseSeconds = solved ? secondsUsed : (ROUND_TIME_LIMIT + UNSOLVED_PENALTY);
    let penaltySeconds = (wrongAttempts * WRONG_ATTEMPT_PENALTY) + (hintsUsed * HINT_PENALTY);
    let roundTime = baseSeconds + penaltySeconds;

    const roundData = {
      roundNum,
      answer,
      solved,
      secondsUsed,
      wrongAttempts,
      hintsUsed,
      roundTime,
    };

    run.rounds[roundNum - 1] = roundData;
    run.totalTime = run.rounds.reduce((acc, r) => acc + (r ? r.roundTime : 0), 0);
    run.totalWrong = run.rounds.reduce((acc, r) => acc + (r ? r.wrongAttempts : 0), 0);
    run.totalHints = run.rounds.reduce((acc, r) => acc + (r ? r.hintsUsed : 0), 0);
    run.roundsSolved = run.rounds.filter(r => r && r.solved).length;

    return roundData;
  }

  // Complete team run after round 3 reveal
  completeTeamRun(roomId, members, teamSize) {
    const run = teamRunResults.get(roomId);
    if (!run) return null;

    run.members = members || run.members || [];
    run.teamSize = teamSize || run.members.length || 0;
    run.status = 'completed';
    run.completedAt = Date.now();

    this.releaseTeamSlot(roomId);
    const rankInfo = this.updateLeaderboard(run);

    // Ticker announcement if competitive
    if (!run.isPractice) {
      const timeStr = formatTime(run.totalTime);
      const tickerMsg = `🎉 Team ${run.teamName} finished in ${timeStr} and took #${rankInfo.rank}!`;
      tickerHistory.unshift({
        id: `tick_${Date.now()}_${Math.random()}`,
        message: tickerMsg,
        timestamp: Date.now(),
      });
      if (tickerHistory.length > 20) tickerHistory.length = 20;
    }

    saveEventState();
    return { ...run, ...rankInfo };
  }

  isTeamActive(roomId) {
    return activeTeams.has(roomId);
  }

  get activeTeams() {
    return activeTeams;
  }

  get queuedTeams() {
    return queuedTeams;
  }

  get leaderboard() {
    return leaderboard;
  }

  // Update leaderboard & compute ranking with tie-breakers
  updateLeaderboard(run) {
    const existingIdx = leaderboard.findIndex(e => e.roomId === run.roomId);
    if (existingIdx >= 0) {
      leaderboard[existingIdx] = { ...run };
    } else {
      leaderboard.push({ ...run });
    }

    this.sortLeaderboard(leaderboard);

    const rank = this.getTeamRank(run.roomId);
    const gap = this.getGapToNextTeam(run.roomId);
    const badges = this.calculateBadges(run);

    return { rank, gap, badges };
  }

  // Tie-breaker comparator
  sortLeaderboard(board) {
    board.sort((a, b) => {
      // 0. Official runs rank above practice runs
      if (!a.isPractice && b.isPractice) return -1;
      if (a.isPractice && !b.isPractice) return 1;

      // 1. Complete teams rank above incomplete teams
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (a.status !== 'completed' && b.status === 'completed') return 1;

      // 2. More rounds solved
      if (b.roundsSolved !== a.roundsSolved) {
        return b.roundsSolved - a.roundsSolved;
      }

      // 3. Lower total time
      if (a.totalTime !== b.totalTime) {
        return a.totalTime - b.totalTime;
      }

      // 4. Fewer wrong attempts
      if (a.totalWrong !== b.totalWrong) {
        return a.totalWrong - b.totalWrong;
      }

      // 5. Fewer hints
      if (a.totalHints !== b.totalHints) {
        return a.totalHints - b.totalHints;
      }

      // 6. Faster round 1 time
      const aR1 = a.rounds[0]?.roundTime || 9999;
      const bR1 = b.rounds[0]?.roundTime || 9999;
      return aR1 - bR1;
    });
  }

  getLeaderboard(filter = 'all') {
    let board = [...leaderboard];
    if (filter === 'small') {
      board = board.filter(e => e.teamSize >= 3 && e.teamSize <= 5);
    } else if (filter === 'large') {
      board = board.filter(e => e.teamSize >= 6 && e.teamSize <= 8);
    }

    return board.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
      totalTimeFormatted: formatTime(entry.totalTime),
      badges: this.calculateBadges(entry),
    }));
  }

  getTeamRank(roomId) {
    const idx = leaderboard.findIndex(e => e.roomId === roomId);
    return idx >= 0 ? idx + 1 : leaderboard.length + 1;
  }

  getGapToNextTeam(roomId) {
    const idx = leaderboard.findIndex(e => e.roomId === roomId);
    if (idx <= 0) {
      if (leaderboard.length > 1 && idx === 0) {
        const lead = Math.round(leaderboard[1].totalTime - leaderboard[0].totalTime);
        return lead > 0 ? `${lead}s ahead of #2` : 'Tied for #1';
      }
      return 'Currently in 1st Place!';
    }

    const higherTeam = leaderboard[idx - 1];
    const diff = Math.round(leaderboard[idx].totalTime - higherTeam.totalTime);
    return diff > 0 ? `${diff}s behind #${idx} (${higherTeam.teamName})` : `Tied with #${idx} (${higherTeam.teamName})`;
  }

  calculateBadges(run) {
    const badges = [];
    if (!run || !Array.isArray(run.rounds)) return badges;

    // Flawless: 3/3 solved with 0 hints and 0 wrong attempts
    if (run.roundsSolved === EVENT_ROUNDS && run.totalWrong === 0 && run.totalHints === 0) {
      badges.push('Flawless');
    }

    // No Hints: 0 hints used
    if (run.totalHints === 0 && run.rounds.length === EVENT_ROUNDS) {
      badges.push('No Hints');
    }

    // Fastest Round: any round solved in <= 20 seconds
    const hasFastRound = run.rounds.some(r => r && r.solved && r.secondsUsed <= 20);
    if (hasFastRound) {
      badges.push('Fastest Round');
    }

    // Practice badge
    if (run.isPractice) {
      badges.push('Practice');
    }

    return badges;
  }

  getPlayingNow() {
    const list = [];
    activeTeams.forEach(roomId => {
      const run = teamRunResults.get(roomId);
      if (run) {
        list.push({
          roomId,
          teamName: run.teamName,
          currentRound: run.rounds.length + 1 > EVENT_ROUNDS ? EVENT_ROUNDS : (run.rounds.length + 1),
        });
      }
    });
    return list;
  }

  getTicker() {
    return tickerHistory[0]?.message || '';
  }

  getTickerHistory() {
    return tickerHistory;
  }

  getLiveLeaderboardData(filter = 'all') {
    const fullBoard = this.getLeaderboard(filter);
    const officialBoard = fullBoard.filter(e => !e.isPractice);
    return {
      event: currentEvent,
      slotUsage: this.getSlotUsage(),
      playingNow: this.getPlayingNow(),
      podium: officialBoard.slice(0, 3),
      leaderboard: fullBoard,
      ticker: this.getTicker(),
      tickerHistory: this.getTickerHistory(),
    };
  }

  exportResultsCSV() {
    const headers = [
      'Rank',
      'Team Name',
      'Members',
      'Team Size',
      'Rounds Solved',
      'Total Time (s)',
      'Total Time Formatted',
      'Wrong Attempts',
      'Hints Used',
      'Round 1 (s)',
      'Round 2 (s)',
      'Round 3 (s)',
      'Status',
      'Practice Run',
      'Completed At'
    ];

    const rows = leaderboard.map((e, idx) => [
      idx + 1,
      `"${(e.teamName || '').replace(/"/g, '""')}"`,
      `"${(Array.isArray(e.members) ? e.members.join(', ') : '').replace(/"/g, '""')}"`,
      e.teamSize || 0,
      `${e.roundsSolved || 0}/${EVENT_ROUNDS}`,
      e.totalTime || 0,
      `"${formatTime(e.totalTime)}"`,
      e.totalWrong || 0,
      e.totalHints || 0,
      e.rounds[0]?.roundTime || '-',
      e.rounds[1]?.roundTime || '-',
      e.rounds[2]?.roundTime || '-',
      e.status,
      e.isPractice ? 'Yes' : 'No',
      e.completedAt ? new Date(e.completedAt).toISOString() : '-'
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

module.exports = new EventManager();
