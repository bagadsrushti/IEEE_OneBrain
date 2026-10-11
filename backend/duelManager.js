const fs = require('fs');
const path = require('path');
const {
  DUEL_MIN_PLAYERS,
  DUEL_MAX_PLAYERS,
  TEAM_MIN_PLAYERS,
  TEAM_MAX_PLAYERS,
  DUEL_TARGET_SOLVES,
  DUEL_MAIN_KEYWORDS,
  DUEL_RESERVE_KEYWORDS,
  DUEL_TOTAL_KEYWORDS,
  DUEL_KEYWORD_TIME_CAP,
  DUEL_REVEAL_SECONDS,
  DUEL_DEFAULT_MAX_MINUTES,
  DUEL_MIN_MAX_MINUTES,
  DUEL_MAX_MAX_MINUTES,
  DUEL_TEAM_DISCONNECT_FORFEIT_MS,
  DEFAULT_TEAM_RED_NAME,
  DEFAULT_TEAM_BLUE_NAME,
  TEAM_NAME_MAX_LENGTH,
  DEFAULT_PRIZE_BANNER,
  DEFAULT_TIE_BREAKER,
  DUEL_MEMORY_EXPIRY_MS,
} = require('./config/duelConfig');

const { MAX_ROOMS } = require('./config/eventConfig');
const { dealClues } = require('./utils/dealClues');
const { isCorrectGuess } = require('./utils/answerMatcher');
const { getRulesForPlayerCount } = require('./config/gameRules');

const DUEL_DATA_PATH = path.join(__dirname, 'data', 'duelData.json');
const challengesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'challenges.json'), 'utf8')).map((c, i) => {
  if (!c.id) c.id = `challenge_${i}`;
  return c;
});

// In-memory store
const duels = new Map(); // duelCode -> duelObject
let finishedDuelsArchive = []; // persisted list of finished duels
let adminSettings = {
  maxMinutes: DUEL_DEFAULT_MAX_MINUTES,
  prizeBanner: DEFAULT_PRIZE_BANNER,
  tieBreaker: DEFAULT_TIE_BREAKER,
};

// Load persisted duel data
function loadDuelData() {
  try {
    if (fs.existsSync(DUEL_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DUEL_DATA_PATH, 'utf8'));
      if (Array.isArray(data.finishedDuels)) finishedDuelsArchive = data.finishedDuels;
      if (data.adminSettings) adminSettings = { ...adminSettings, ...data.adminSettings };
    }
  } catch (err) {
    console.error('Failed to load duelData.json:', err);
  }
}

function saveDuelData() {
  try {
    const data = {
      finishedDuels: finishedDuelsArchive.slice(-100),
      adminSettings,
    };
    fs.writeFileSync(DUEL_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save duelData.json:', err);
  }
}

loadDuelData();

function generateDuelCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

function sanitizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/<[^>]*>/g, '').replace(/[<>'"]/g, '').trim().slice(0, TEAM_NAME_MAX_LENGTH);
}

class DuelManager {
  constructor() {
    this.gameManager = null; // injected
    this.io = null; // injected
  }

  setGameManager(gm) {
    this.gameManager = gm;
  }

  setIo(ioInstance) {
    this.io = ioInstance;
  }

  getAdminSettings() {
    return { ...adminSettings };
  }

  updateAdminSettings({ maxMinutes, prizeBanner, tieBreaker }) {
    if (typeof maxMinutes === 'number' && maxMinutes >= DUEL_MIN_MAX_MINUTES && maxMinutes <= DUEL_MAX_MAX_MINUTES) {
      adminSettings.maxMinutes = maxMinutes;
    }
    if (typeof prizeBanner === 'string' && prizeBanner.trim()) {
      adminSettings.prizeBanner = prizeBanner.trim().slice(0, 80);
    }
    if (tieBreaker === 'draw' || tieBreaker === 'sudden_death') {
      adminSettings.tieBreaker = tieBreaker;
    }
    saveDuelData();
    return { ...adminSettings };
  }

  getRoomUsage() {
    let activeRoomsCount = 0;
    if (this.gameManager) {
      activeRoomsCount = this.gameManager.getActiveRooms().length;
    }
    const liveDuelsCount = Array.from(duels.values()).filter(d => d.status === 'lobby' || d.status === 'in_progress').length;
    return {
      activeRooms: activeRoomsCount,
      liveDuels: liveDuelsCount,
      maxRooms: MAX_ROOMS,
      capacityAvailable: activeRoomsCount + 2 <= MAX_ROOMS,
    };
  }

  createDuel(hostNickname) {
    const usage = this.getRoomUsage();
    if (usage.activeRooms + 2 > MAX_ROOMS) {
      throw new Error(`Maximum room limit reached (${MAX_ROOMS}). Cannot create new duel.`);
    }

    let code;
    do {
      code = generateDuelCode();
    } while (duels.has(code) || (this.gameManager && this.gameManager.getRoom(code)));

    const hostToken = generateToken();
    const hostPlayerId = 'p_' + Math.random().toString(36).substr(2, 9);
    const cleanNick = sanitizeName(hostNickname) || 'Host';

    const duel = {
      code,
      hostId: hostPlayerId,
      status: 'lobby', // 'lobby', 'in_progress', 'finished', 'cancelled'
      players: [
        {
          id: hostPlayerId,
          name: cleanNick,
          token: hostToken,
          team: null, // 'red' or 'blue'
          connected: true,
          socketId: null,
          joinedAt: Date.now(),
        }
      ],
      teamRed: {
        id: 'red',
        name: DEFAULT_TEAM_RED_NAME,
        playerIds: [],
        roomId: null,
        solvedCount: 0,
        reservesUsed: 0,
        totalSolveTime: 0,
        totalWrongAttempts: 0,
        currentKeyword: null,
        currentKeywordStartTime: 0,
        currentKeywordIndex: 0,
        history: [], // [{ answer, category, solved, timeSpent, wrongAttempts }]
        disconnectTimer: null,
        keywordTimer: null,
        revealTimer: null,
        inReveal: false,
        exhaustedReserves: false,
      },
      teamBlue: {
        id: 'blue',
        name: DEFAULT_TEAM_BLUE_NAME,
        playerIds: [],
        roomId: null,
        solvedCount: 0,
        reservesUsed: 0,
        totalSolveTime: 0,
        totalWrongAttempts: 0,
        currentKeyword: null,
        currentKeywordStartTime: 0,
        currentKeywordIndex: 0,
        history: [],
        disconnectTimer: null,
        keywordTimer: null,
        revealTimer: null,
        inReveal: false,
        exhaustedReserves: false,
      },
      pool: {
        main: [],
        reserves: [],
      },
      teamRedSequence: [],
      teamBlueSequence: [],
      startTime: null,
      endTime: null,
      matchCapTimer: null,
      maxMinutes: adminSettings.maxMinutes,
      prizeBanner: adminSettings.prizeBanner,
      winner: null, // 'red', 'blue', 'draw'
      winnerReason: null, // 'first_to_3', 'time_cap_solves', 'tie_breaker_time', 'tie_breaker_wrong', 'draw', 'forfeit', 'admin_ended'
      winningTeamName: null,
      winningPlayers: [],
      chocolateAwarded: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    duels.set(code, duel);
    saveDuelData();
    return { duel, hostPlayer: duel.players[0] };
  }

  getDuel(code) {
    if (!code) return null;
    return duels.get(code.toUpperCase()) || null;
  }

  joinDuel(code, nickname, token = null) {
    code = code ? code.toUpperCase() : '';
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };

    const cleanNick = sanitizeName(nickname) || 'Player';

    // 1. Reconnect with existing token
    if (token) {
      const existing = duel.players.find(p => p.token === token);
      if (existing) {
        existing.connected = true;
        duel.lastActiveAt = Date.now();
        
        // Cancel team disconnect timer if running
        const teamObj = existing.team === 'red' ? duel.teamRed : existing.team === 'blue' ? duel.teamBlue : null;
        if (teamObj && teamObj.disconnectTimer) {
          clearTimeout(teamObj.disconnectTimer);
          teamObj.disconnectTimer = null;
        }

        return { success: true, duel, player: existing, token: existing.token };
      }
    }

    // 2. Reject join if duel already started or finished
    if (duel.status !== 'lobby') {
      return { error: 'Duel already started' };
    }

    // 3. Player limit check (DUEL_MAX_PLAYERS = 16)
    if (duel.players.length >= DUEL_MAX_PLAYERS) {
      return { error: `Duel is full (max ${DUEL_MAX_PLAYERS} players)` };
    }

    // Create new player
    const newToken = generateToken();
    const newPlayer = {
      id: 'p_' + Math.random().toString(36).substr(2, 9),
      name: cleanNick,
      token: newToken,
      team: null,
      connected: true,
      socketId: null,
      joinedAt: Date.now(),
    };

    duel.players.push(newPlayer);
    duel.lastActiveAt = Date.now();

    return { success: true, duel, player: newPlayer, token: newToken };
  }

  leaveDuel(code, playerId) {
    const duel = this.getDuel(code);
    if (!duel) return null;

    const player = duel.players.find(p => p.id === playerId);
    if (!player) return duel;

    player.connected = false;
    duel.lastActiveAt = Date.now();

    // If still in lobby, remove player entirely
    if (duel.status === 'lobby') {
      duel.players = duel.players.filter(p => p.id !== playerId);
      duel.teamRed.playerIds = duel.teamRed.playerIds.filter(id => id !== playerId);
      duel.teamBlue.playerIds = duel.teamBlue.playerIds.filter(id => id !== playerId);

      // If host left, reassign host if players remain, else delete duel
      if (duel.hostId === playerId) {
        if (duel.players.length > 0) {
          duel.hostId = duel.players[0].id;
        } else {
          duels.delete(code);
          return null;
        }
      }
    } else if (duel.status === 'in_progress') {
      // In-progress: check if entire team is disconnected
      const teamKey = player.team;
      const teamObj = teamKey === 'red' ? duel.teamRed : teamKey === 'blue' ? duel.teamBlue : null;
      if (teamObj) {
        const teamPlayers = duel.players.filter(p => teamObj.playerIds.includes(p.id));
        const allDisconnected = teamPlayers.every(p => !p.connected);
        if (allDisconnected && !teamObj.disconnectTimer) {
          // Start 60-second forfeit timer
          teamObj.disconnectTimer = setTimeout(() => {
            this.handleTeamForfeit(duel.code, teamKey);
          }, DUEL_TEAM_DISCONNECT_FORFEIT_MS);
        }
      }
    }

    return duel;
  }

  splitTeams(code, hostId, shuffle = false) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can split teams' };
    if (duel.status !== 'lobby') return { error: 'Teams can only be split in the lobby' };

    const count = duel.players.length;
    if (count < DUEL_MIN_PLAYERS) {
      return { error: `At least ${DUEL_MIN_PLAYERS} players are required to split teams (currently ${count})` };
    }
    if (count > DUEL_MAX_PLAYERS) {
      return { error: `At most ${DUEL_MAX_PLAYERS} players are allowed (currently ${count})` };
    }

    // Shuffle players randomly
    const shuffled = [...duel.players].sort(() => 0.5 - Math.random());
    const half = Math.ceil(shuffled.length / 2);

    const redPlayers = shuffled.slice(0, half);
    const bluePlayers = shuffled.slice(half);

    // Validate sizes differ by at most 1, and both are within 2..8
    if (Math.abs(redPlayers.length - bluePlayers.length) > 1) {
      return { error: 'Failed to split into balanced teams' };
    }
    if (redPlayers.length < TEAM_MIN_PLAYERS || redPlayers.length > TEAM_MAX_PLAYERS ||
        bluePlayers.length < TEAM_MIN_PLAYERS || bluePlayers.length > TEAM_MAX_PLAYERS) {
      return { error: `Each team must have between ${TEAM_MIN_PLAYERS} and ${TEAM_MAX_PLAYERS} players` };
    }

    duel.teamRed.playerIds = redPlayers.map(p => p.id);
    duel.teamBlue.playerIds = bluePlayers.map(p => p.id);

    redPlayers.forEach(p => p.team = 'red');
    bluePlayers.forEach(p => p.team = 'blue');

    duel.lastActiveAt = Date.now();
    return { success: true, duel };
  }

  renameTeams(code, hostId, teamRedName, teamBlueName) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can rename teams' };

    const cleanRed = sanitizeName(teamRedName);
    const cleanBlue = sanitizeName(teamBlueName);

    if (cleanRed) duel.teamRed.name = cleanRed;
    if (cleanBlue) duel.teamBlue.name = cleanBlue;

    duel.lastActiveAt = Date.now();
    return { success: true, duel };
  }

  buildKeywordPool(minCluesRequired) {
    // Filter challenges with >= minCluesRequired
    const eligible = challengesData.filter(c => Array.isArray(c.clues) && c.clues.length >= minCluesRequired);

    if (eligible.length < DUEL_TOTAL_KEYWORDS) {
      throw new Error(`Dataset cannot provide ${DUEL_TOTAL_KEYWORDS} eligible keywords with at least ${minCluesRequired} clues (only ${eligible.length} available).`);
    }

    // Prefer 8-clue keywords if available
    const eightClueKeywords = eligible.filter(c => c.clues.length >= 8);
    let candidatePool = eightClueKeywords.length >= DUEL_TOTAL_KEYWORDS ? eightClueKeywords : eligible;

    // Spread across categories
    const byCategory = {};
    candidatePool.forEach(c => {
      byCategory[c.category] = byCategory[c.category] || [];
      byCategory[c.category].push(c);
    });

    const categories = Object.keys(byCategory).sort(() => 0.5 - Math.random());
    const selected = [];
    const usedIds = new Set();

    // Round-robin selection across categories
    let catIdx = 0;
    while (selected.length < DUEL_TOTAL_KEYWORDS && candidatePool.length > usedIds.size) {
      const cat = categories[catIdx % categories.length];
      const availableInCat = (byCategory[cat] || []).filter(c => !usedIds.has(c.id));
      if (availableInCat.length > 0) {
        const pick = availableInCat[Math.floor(Math.random() * availableInCat.length)];
        selected.push(pick);
        usedIds.add(pick.id);
      }
      catIdx++;
    }

    // Fill remaining if needed
    if (selected.length < DUEL_TOTAL_KEYWORDS) {
      const remaining = candidatePool.filter(c => !usedIds.has(c.id)).sort(() => 0.5 - Math.random());
      while (selected.length < DUEL_TOTAL_KEYWORDS && remaining.length > 0) {
        selected.push(remaining.pop());
      }
    }

    if (selected.length < DUEL_TOTAL_KEYWORDS) {
      throw new Error(`Could not assemble ${DUEL_TOTAL_KEYWORDS} distinct keywords for the duel.`);
    }

    const main = selected.slice(0, DUEL_MAIN_KEYWORDS);
    const reserves = selected.slice(DUEL_MAIN_KEYWORDS, DUEL_TOTAL_KEYWORDS);

    return { main, reserves };
  }

  startDuel(code, hostId) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can start the duel' };
    if (duel.status !== 'lobby') return { error: 'Duel is not in lobby state' };

    const redCount = duel.teamRed.playerIds.length;
    const blueCount = duel.teamBlue.playerIds.length;
    const totalCount = duel.players.length;

    if (totalCount < DUEL_MIN_PLAYERS || totalCount > DUEL_MAX_PLAYERS) {
      return { error: `Total players must be between ${DUEL_MIN_PLAYERS} and ${DUEL_MAX_PLAYERS} (currently ${totalCount})` };
    }
    if (redCount < TEAM_MIN_PLAYERS || redCount > TEAM_MAX_PLAYERS ||
        blueCount < TEAM_MIN_PLAYERS || blueCount > TEAM_MAX_PLAYERS) {
      return { error: `Both teams must have between ${TEAM_MIN_PLAYERS} and ${TEAM_MAX_PLAYERS} players. Please split teams.` };
    }

    const maxTeamSize = Math.max(redCount, blueCount);

    let pool;
    try {
      pool = this.buildKeywordPool(maxTeamSize);
    } catch (err) {
      return { error: err.message };
    }

    duel.pool = pool;

    // Build offset sequences:
    // Team Red: [M0, M1, M2]
    // Team Blue: [M1, M2, M0]
    // Guarantees at any step the two teams are NEVER on the same keyword!
    duel.teamRedSequence = [pool.main[0], pool.main[1], pool.main[2]];
    duel.teamBlueSequence = [pool.main[1], pool.main[2], pool.main[0]];

    // Create internal rooms for each team
    try {
      const redRoomCode = this.gameManager.createRoom('duel_team', duel.teamRed.name);
      const blueRoomCode = this.gameManager.createRoom('duel_team', duel.teamBlue.name);

      duel.teamRed.roomId = redRoomCode;
      duel.teamBlue.roomId = blueRoomCode;

      // Link internal room objects
      const redRoom = this.gameManager.getRoom(redRoomCode);
      const blueRoom = this.gameManager.getRoom(blueRoomCode);

      redRoom.duelCode = duel.code;
      redRoom.duelTeam = 'red';
      blueRoom.duelCode = duel.code;
      blueRoom.duelTeam = 'blue';

      // Transfer players to internal rooms
      const redPlayers = duel.players.filter(p => duel.teamRed.playerIds.includes(p.id));
      const bluePlayers = duel.players.filter(p => duel.teamBlue.playerIds.includes(p.id));

      redPlayers.forEach(p => {
        this.gameManager.joinRoom(redRoomCode, p.name, p.token);
      });
      bluePlayers.forEach(p => {
        this.gameManager.joinRoom(blueRoomCode, p.name, p.token);
      });
    } catch (err) {
      return { error: `Failed to initialize internal duel rooms: ${err.message}` };
    }

    duel.status = 'in_progress';
    duel.startTime = Date.now();
    duel.lastActiveAt = Date.now();

    // Start match cap timer (default 10 min)
    const matchCapMs = duel.maxMinutes * 60 * 1000;
    duel.matchCapTimer = setTimeout(() => {
      this.handleMatchCapTimeout(duel.code);
    }, matchCapMs);

    // Launch first keyword for both teams
    this.startTeamKeyword(duel, 'red', 0);
    this.startTeamKeyword(duel, 'blue', 0);

    return { success: true, duel };
  }

  startTeamKeyword(duel, teamKey, sequenceIndex) {
    if (duel.status !== 'in_progress') return;

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    const sequence = teamKey === 'red' ? duel.teamRedSequence : duel.teamBlueSequence;

    if (sequenceIndex >= sequence.length) {
      // Sequence exhausted without 3 solves; check if reserves available
      if (team.reservesUsed < DUEL_RESERVE_KEYWORDS) {
        const nextReserve = this.pickNextReserve(duel, teamKey);
        if (nextReserve) {
          sequence.push(nextReserve);
          team.reservesUsed += 1;
        } else {
          team.exhaustedReserves = true;
          this.checkDuelCompletion(duel);
          return;
        }
      } else {
        team.exhaustedReserves = true;
        this.checkDuelCompletion(duel);
        return;
      }
    }

    const keyword = sequence[sequenceIndex];
    team.currentKeyword = keyword;
    team.currentKeywordIndex = sequenceIndex;
    team.currentKeywordStartTime = Date.now();
    team.inReveal = false;

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (!internalRoom) return;

    // Reset room state for new keyword
    const N = internalRoom.players.length;
    const rules = getRulesForPlayerCount(N);

    internalRoom.currentChallenge = keyword;
    internalRoom.state = 'playing';
    internalRoom.roundRules = rules;
    internalRoom.wrongAttempts = 0;
    internalRoom.hintsUsed = 0;
    internalRoom.sharedHint = null;
    internalRoom.roundStartTime = Date.now();
    internalRoom.roundPlayStartTime = Date.now();
    internalRoom.roundEndTime = Date.now() + (DUEL_KEYWORD_TIME_CAP * 1000);
    internalRoom.waveIntervalSeconds = rules.waveIntervalSeconds;

    // Deal clues across players
    const piles = dealClues(keyword, N);
    const maxPileSize = Math.max(...piles.map(p => p.length));
    internalRoom.totalWaves = maxPileSize;
    internalRoom.currentWave = 1;

    piles.forEach((pile, pIdx) => {
      const player = internalRoom.players[pIdx];
      if (player) {
        player.clue = pile.length > 0 ? (pile[0].text || pile[0]) : '';
        player.fullCluePile = pile;
        player.releasedClues = rules.waveIntervalSeconds > 0 ? (pile.length > 0 ? [pile[0]] : []) : pile;
      }
    });

    // Progressive wave timer
    if (rules.waveIntervalSeconds > 0 && maxPileSize > 1) {
      this.gameManager.scheduleClueWaves(internalRoom, rules.waveIntervalSeconds, maxPileSize);
    }

    // Set keyword expiration timer (120s cap)
    if (team.keywordTimer) clearTimeout(team.keywordTimer);
    team.keywordTimer = setTimeout(() => {
      this.handleKeywordTimeout(duel.code, teamKey, sequenceIndex);
    }, DUEL_KEYWORD_TIME_CAP * 1000);

    // Notify sockets
    this.broadcastTeamState(duel, teamKey);
    this.broadcastDuelUpdate(duel);
  }

  pickNextReserve(duel, requestingTeamKey) {
    const otherTeam = requestingTeamKey === 'red' ? duel.teamBlue : duel.teamRed;
    const otherCurrentId = otherTeam.currentKeyword?.id;

    const availableReserves = duel.pool.reserves.filter(r => r.id !== otherCurrentId);
    if (availableReserves.length === 0) {
      return duel.pool.reserves[0] || null;
    }

    // Pick first available reserve and remove from remaining reserve pool
    const chosen = availableReserves[0];
    duel.pool.reserves = duel.pool.reserves.filter(r => r.id !== chosen.id);
    return chosen;
  }

  submitAnswer(duelCode, teamKey, playerId, guess) {
    const duel = this.getDuel(duelCode);
    if (!duel) return { error: 'Duel not found' };
    if (duel.status !== 'in_progress') return { error: 'Duel is not currently active' };

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.inReveal) return { error: 'Keyword already ended' };

    const keyword = team.currentKeyword;
    if (!keyword) return { error: 'No active keyword' };

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (!internalRoom) return { error: 'Internal room not found' };

    const now = Date.now();
    const result = isCorrectGuess(guess, keyword);

    if (result.correct) {
      // Clear keyword timer
      if (team.keywordTimer) clearTimeout(team.keywordTimer);

      const solveTime = Math.max(1, (now - team.currentKeywordStartTime) / 1000);
      team.solvedCount += 1;
      team.totalSolveTime += solveTime;

      // Record in history
      team.history.push({
        keywordId: keyword.id,
        answer: keyword.answer,
        category: keyword.category,
        solved: true,
        solveTime,
        wrongAttempts: internalRoom.wrongAttempts || 0,
      });

      // CHECK WINNER: FIRST TEAM TO 3 SOLVES WINS!
      if (team.solvedCount >= DUEL_TARGET_SOLVES) {
        this.endDuelWithWinner(duel, teamKey, 'first_to_3');
        return { success: true, isCorrect: true, winner: teamKey, solvedCount: team.solvedCount };
      }

      // Enter 6-second reveal screen
      this.triggerReveal(duel, teamKey, keyword, true);
      return { success: true, isCorrect: true, solvedCount: team.solvedCount };
    } else {
      internalRoom.wrongAttempts = (internalRoom.wrongAttempts || 0) + 1;
      team.totalWrongAttempts += 1;

      const maxAttempts = internalRoom.roundRules?.maxAttempts || 3;
      if (internalRoom.wrongAttempts >= maxAttempts) {
        // Attempts exhausted! Keyword failed
        if (team.keywordTimer) clearTimeout(team.keywordTimer);
        this.handleKeywordFailure(duel, teamKey, 'max_attempts');
        return { success: true, isCorrect: false, exhausted: true, near: result.near };
      }

      this.broadcastTeamState(duel, teamKey);
      return { success: true, isCorrect: false, near: result.near, attemptsLeft: maxAttempts - internalRoom.wrongAttempts };
    }
  }

  handleKeywordTimeout(duelCode, teamKey, sequenceIndex) {
    const duel = this.getDuel(duelCode);
    if (!duel || duel.status !== 'in_progress') return;

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.currentKeywordIndex !== sequenceIndex || team.inReveal) return;

    this.handleKeywordFailure(duel, teamKey, 'timeout');
  }

  handleKeywordFailure(duel, teamKey, reason) {
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    const keyword = team.currentKeyword;
    if (!keyword || team.inReveal) return;

    const internalRoom = this.gameManager.getRoom(team.roomId);

    team.history.push({
      keywordId: keyword.id,
      answer: keyword.answer,
      category: keyword.category,
      solved: false,
      solveTime: DUEL_KEYWORD_TIME_CAP,
      wrongAttempts: internalRoom ? internalRoom.wrongAttempts : 3,
      failReason: reason,
    });

    this.triggerReveal(duel, teamKey, keyword, false);
  }

  triggerReveal(duel, teamKey, keyword, solved) {
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    team.inReveal = true;

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (internalRoom) {
      internalRoom.state = 'reveal';
      internalRoom.lastRevealData = {
        answer: keyword.answer,
        category: keyword.category,
        solved,
        allClues: internalRoom.players.map(p => ({
          name: p.name,
          clues: (p.releasedClues || []).map(c => typeof c === 'string' ? c : c.text),
        })),
      };
      internalRoom.revealEndTime = Date.now() + (DUEL_REVEAL_SECONDS * 1000);
    }

    this.broadcastTeamState(duel, teamKey);
    this.broadcastDuelUpdate(duel);

    // After 6 seconds, advance to next keyword
    if (team.revealTimer) clearTimeout(team.revealTimer);
    team.revealTimer = setTimeout(() => {
      team.inReveal = false;
      this.startTeamKeyword(duel, teamKey, team.currentKeywordIndex + 1);
    }, DUEL_REVEAL_SECONDS * 1000);
  }

  endDuelWithWinner(duel, winnerKey, reason) {
    if (duel.status === 'finished') return;

    duel.status = 'finished';
    duel.endTime = Date.now();
    duel.winner = winnerKey; // 'red', 'blue', or 'draw'
    duel.winnerReason = reason;

    if (duel.matchCapTimer) clearTimeout(duel.matchCapTimer);

    // Stop both teams' active timers
    [duel.teamRed, duel.teamBlue].forEach(t => {
      if (t.keywordTimer) clearTimeout(t.keywordTimer);
      if (t.revealTimer) clearTimeout(t.revealTimer);
      if (t.disconnectTimer) clearTimeout(t.disconnectTimer);

      const r = this.gameManager.getRoom(t.roomId);
      if (r) {
        r.state = 'finished';
      }
    });

    if (winnerKey === 'red') {
      duel.winningTeamName = duel.teamRed.name;
      duel.winningPlayers = duel.players.filter(p => duel.teamRed.playerIds.includes(p.id)).map(p => p.name);
    } else if (winnerKey === 'blue') {
      duel.winningTeamName = duel.teamBlue.name;
      duel.winningPlayers = duel.players.filter(p => duel.teamBlue.playerIds.includes(p.id)).map(p => p.name);
    } else {
      duel.winningTeamName = 'Draw';
      duel.winningPlayers = [];
    }

    // Persist finished duel
    const archiveRecord = {
      code: duel.code,
      status: 'finished',
      teamRedName: duel.teamRed.name,
      teamBlueName: duel.teamBlue.name,
      teamRedSolved: duel.teamRed.solvedCount,
      teamBlueSolved: duel.teamBlue.solvedCount,
      teamRedTime: duel.teamRed.totalSolveTime,
      teamBlueTime: duel.teamBlue.totalSolveTime,
      teamRedWrong: duel.teamRed.totalWrongAttempts,
      teamBlueWrong: duel.teamBlue.totalWrongAttempts,
      winner: duel.winner,
      winningTeamName: duel.winningTeamName,
      winnerReason: duel.winnerReason,
      winningPlayers: duel.winningPlayers,
      totalDurationSeconds: Math.round((duel.endTime - duel.startTime) / 1000),
      chocolateAwarded: duel.chocolateAwarded,
      finishedAt: duel.endTime,
    };

    finishedDuelsArchive.push(archiveRecord);
    saveDuelData();

    // Schedule memory cleanup after 30 minutes
    setTimeout(() => {
      duels.delete(duel.code);
    }, DUEL_MEMORY_EXPIRY_MS);

    // Broadcast winner announcement
    this.broadcastDuelUpdate(duel);
    if (this.io) {
      this.io.emit('arena_update', this.getArenaData());
    }
  }

  handleMatchCapTimeout(duelCode) {
    const duel = this.getDuel(duelCode);
    if (!duel || duel.status !== 'in_progress') return;

    const red = duel.teamRed;
    const blue = duel.teamBlue;

    let winnerKey = 'draw';
    let reason = 'draw';

    // 1. More solves wins
    if (red.solvedCount > blue.solvedCount) {
      winnerKey = 'red';
      reason = 'time_cap_solves';
    } else if (blue.solvedCount > red.solvedCount) {
      winnerKey = 'blue';
      reason = 'time_cap_solves';
    } else {
      // 2. Tie-breaker 1: Lower total time spent on solved keywords
      if (red.totalSolveTime < blue.totalSolveTime) {
        winnerKey = 'red';
        reason = 'tie_breaker_time';
      } else if (blue.totalSolveTime < red.totalSolveTime) {
        winnerKey = 'blue';
        reason = 'tie_breaker_time';
      } else {
        // 3. Tie-breaker 2: Fewer wrong attempts
        if (red.totalWrongAttempts < blue.totalWrongAttempts) {
          winnerKey = 'red';
          reason = 'tie_breaker_wrong';
        } else if (blue.totalWrongAttempts < red.totalWrongAttempts) {
          winnerKey = 'blue';
          reason = 'tie_breaker_wrong';
        } else {
          winnerKey = 'draw';
          reason = 'draw';
        }
      }
    }

    this.endDuelWithWinner(duel, winnerKey, reason);
  }

  handleTeamForfeit(duelCode, forfeitedTeamKey) {
    const duel = this.getDuel(duelCode);
    if (!duel || duel.status !== 'in_progress') return;

    const winningTeamKey = forfeitedTeamKey === 'red' ? 'blue' : 'red';
    this.endDuelWithWinner(duel, winningTeamKey, 'forfeit');
  }

  checkDuelCompletion(duel) {
    // If both teams have exhausted reserves without reaching 3 solves
    if (duel.teamRed.exhaustedReserves && duel.teamBlue.exhaustedReserves) {
      this.handleMatchCapTimeout(duel.code);
    }
  }

  markChocolateAwarded(code, awarded = true) {
    const duel = this.getDuel(code);
    if (duel) {
      duel.chocolateAwarded = awarded;
    }
    const archived = finishedDuelsArchive.find(d => d.code === code);
    if (archived) {
      archived.chocolateAwarded = awarded;
    }
    saveDuelData();
    if (this.io) {
      this.io.emit('arena_update', this.getArenaData());
    }
    return { success: true, code, chocolateAwarded: awarded };
  }

  cancelDuel(code) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };

    duel.status = 'cancelled';
    if (duel.matchCapTimer) clearTimeout(duel.matchCapTimer);
    if (duel.teamRed.keywordTimer) clearTimeout(duel.teamRed.keywordTimer);
    if (duel.teamBlue.keywordTimer) clearTimeout(duel.teamBlue.keywordTimer);

    [duel.teamRed.roomId, duel.teamBlue.roomId].forEach(rid => {
      if (rid && this.gameManager) this.gameManager.deleteRoom(rid);
    });

    duels.delete(code);
    if (this.io) {
      this.io.emit('arena_update', this.getArenaData());
    }
    return { success: true };
  }

  // Safe client state payload (NO LEAKS)
  getClientDuelState(code, playerToken = null) {
    const duel = this.getDuel(code);
    if (!duel) return null;

    const player = duel.players.find(p => p.token === playerToken);
    const playerTeam = player ? player.team : null;

    const elapsedSeconds = duel.startTime
      ? Math.round(((duel.endTime || Date.now()) - duel.startTime) / 1000)
      : 0;

    const prizeBanner = duel.prizeBanner.replace('{team}', duel.winningTeamName || '');

    // Base public state
    const baseState = {
      code: duel.code,
      status: duel.status,
      hostId: duel.hostId,
      playersCount: duel.players.length,
      maxMinutes: duel.maxMinutes,
      elapsedSeconds,
      prizeBanner,
      teamRed: {
        id: 'red',
        name: duel.teamRed.name,
        playerCount: duel.teamRed.playerIds.length,
        solvedCount: duel.teamRed.solvedCount,
        inReveal: duel.teamRed.inReveal,
      },
      teamBlue: {
        id: 'blue',
        name: duel.teamBlue.name,
        playerCount: duel.teamBlue.playerIds.length,
        solvedCount: duel.teamBlue.solvedCount,
        inReveal: duel.teamBlue.inReveal,
      },
    };

    if (duel.status === 'lobby') {
      return {
        ...baseState,
        players: duel.players.map(p => ({
          id: p.id,
          name: p.name,
          team: p.team,
          connected: p.connected,
        })),
        canStart: duel.players.length >= DUEL_MIN_PLAYERS &&
                 duel.teamRed.playerIds.length >= TEAM_MIN_PLAYERS &&
                 duel.teamBlue.playerIds.length >= TEAM_MIN_PLAYERS,
      };
    }

    if (duel.status === 'finished') {
      return {
        ...baseState,
        winner: duel.winner,
        winnerReason: duel.winnerReason,
        winningTeamName: duel.winningTeamName,
        winningPlayers: duel.winningPlayers,
        chocolateAwarded: duel.chocolateAwarded,
        teamRedHistory: duel.teamRed.history,
        teamBlueHistory: duel.teamBlue.history,
      };
    }

    // In-progress: Provide team-specific view with ZERO LEAKS of opponent
    const isRed = playerTeam === 'red';
    const myTeam = isRed ? duel.teamRed : duel.teamBlue;
    const opponentTeam = isRed ? duel.teamBlue : duel.teamRed;

    const internalRoom = myTeam.roomId ? this.gameManager.getRoom(myTeam.roomId) : null;

    return {
      ...baseState,
      myTeamKey: playerTeam,
      myTeamName: myTeam.name,
      opponentTeamName: opponentTeam.name,
      mySolvedCount: myTeam.solvedCount,
      opponentSolvedCount: opponentTeam.solvedCount, // ONLY NUMBER SOLVED
      currentKeywordNumber: (myTeam.currentKeywordIndex || 0) + 1,
      targetSolves: DUEL_TARGET_SOLVES,
      internalRoomCode: myTeam.roomId,
      inReveal: myTeam.inReveal,
      revealData: internalRoom?.lastRevealData || null,
      revealEndTime: internalRoom?.revealEndTime || null,
    };
  }

  // Projector / Audience view (/duel/:code)
  getAudienceState(code) {
    const duel = this.getDuel(code);
    if (!duel) {
      // Check archive
      const archived = finishedDuelsArchive.find(d => d.code === code);
      if (archived) {
        return {
          code: archived.code,
          status: 'finished',
          teamRed: { name: archived.teamRedName, solvedCount: archived.teamRedSolved },
          teamBlue: { name: archived.teamBlueName, solvedCount: archived.teamBlueSolved },
          winner: archived.winner,
          winningTeamName: archived.winningTeamName,
          winnerReason: archived.winnerReason,
          winningPlayers: archived.winningPlayers,
          elapsedSeconds: archived.totalDurationSeconds,
          prizeBanner: adminSettings.prizeBanner.replace('{team}', archived.winningTeamName),
          chocolateAwarded: archived.chocolateAwarded,
        };
      }
      return null;
    }

    const elapsedSeconds = duel.startTime
      ? Math.round(((duel.endTime || Date.now()) - duel.startTime) / 1000)
      : 0;

    return {
      code: duel.code,
      status: duel.status,
      elapsedSeconds,
      maxMinutes: duel.maxMinutes,
      teamRed: {
        name: duel.teamRed.name,
        solvedCount: duel.teamRed.solvedCount,
        inReveal: duel.teamRed.inReveal,
      },
      teamBlue: {
        name: duel.teamBlue.name,
        solvedCount: duel.teamBlue.solvedCount,
        inReveal: duel.teamBlue.inReveal,
      },
      winner: duel.winner,
      winnerReason: duel.winnerReason,
      winningTeamName: duel.winningTeamName,
      winningPlayers: duel.winningPlayers,
      prizeBanner: duel.prizeBanner.replace('{team}', duel.winningTeamName || ''),
      chocolateAwarded: duel.chocolateAwarded,
    };
  }

  // Global Arena view (/arena)
  getArenaData() {
    const liveDuels = [];
    const waitingDuels = [];

    duels.forEach(d => {
      const elapsed = d.startTime ? Math.round(((d.endTime || Date.now()) - d.startTime) / 1000) : 0;
      if (d.status === 'in_progress') {
        liveDuels.push({
          code: d.code,
          teamRedName: d.teamRed.name,
          teamBlueName: d.teamBlue.name,
          teamRedSolved: d.teamRed.solvedCount,
          teamBlueSolved: d.teamBlue.solvedCount,
          elapsedSeconds: elapsed,
          maxMinutes: d.maxMinutes,
        });
      } else if (d.status === 'lobby') {
        waitingDuels.push({
          code: d.code,
          playerCount: d.players.length,
          createdAt: d.createdAt,
        });
      }
    });

    const winners = finishedDuelsArchive.slice(-30).reverse();

    return {
      liveDuels,
      waitingDuels,
      winners,
      roomUsage: this.getRoomUsage(),
    };
  }

  exportCsv() {
    const headers = [
      'Duel Code',
      'Status',
      'Team Red Name',
      'Team Blue Name',
      'Team Red Solved',
      'Team Blue Solved',
      'Team Red Time (s)',
      'Team Blue Time (s)',
      'Team Red Wrong',
      'Team Blue Wrong',
      'Winner',
      'Winner Reason',
      'Winning Members',
      'Duration (s)',
      'Chocolate Awarded',
      'Finished At',
    ];

    const rows = finishedDuelsArchive.map(d => [
      d.code,
      d.status,
      `"${d.teamRedName}"`,
      `"${d.teamBlueName}"`,
      d.teamRedSolved,
      d.teamBlueSolved,
      d.teamRedTime,
      d.teamBlueTime,
      d.teamRedWrong,
      d.teamBlueWrong,
      d.winner,
      d.winnerReason,
      `"${(d.winningPlayers || []).join(', ')}"`,
      d.totalDurationSeconds,
      d.chocolateAwarded ? 'YES' : 'NO',
      new Date(d.finishedAt).toISOString(),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  broadcastTeamState(duel, teamKey) {
    if (!this.io) return;
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.roomId) {
      // Trigger room update for that internal room
      const r = this.gameManager.getRoom(team.roomId);
      if (r) {
        // Handled via socket.js emitGameState
        if (typeof this.onTeamRoomUpdate === 'function') {
          this.onTeamRoomUpdate(team.roomId);
        }
      }
    }
  }

  broadcastDuelUpdate(duel) {
    if (!this.io) return;
    this.io.to(`duel_${duel.code}`).emit('duel_update', this.getAudienceState(duel.code));
    this.io.emit('arena_update', this.getArenaData());
  }
}

module.exports = new DuelManager();
