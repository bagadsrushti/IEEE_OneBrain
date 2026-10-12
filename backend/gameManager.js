const fs = require('fs');
const path = require('path');
const { getRulesForPlayerCount, isFlat120sMode, MIN_PLAYERS, MAX_PLAYERS } = require('./config/gameRules');
const { CATEGORIES } = require('./config/categories');
const { isCorrectGuess, normalize } = require('./utils/answerMatcher');
const { MAX_GUESS_LENGTH } = require('./config/matching');
const eventManager = require('./eventManager');
const { dealClues } = require('./utils/dealClues');
const {
  EVENT_ROUNDS,
  REVEAL_DURATION_SECONDS,
  MAX_ROOMS,
} = require('./config/eventConfig');

let challengesData = [];
try {
  challengesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'challenges.json'), 'utf8')).map((c, i) => {
    if (!c.id) c.id = `challenge_${i}`;
    return c;
  });
} catch (e) {
  console.error("Failed to load challenges.json", e);
}

// In-memory store
const rooms = new Map();
const leaderboard = [];
const userTokens = new Map();

const ROOM_TIMEOUT = 10 * 60 * 1000;

// Admin event theme setting
let eventTheme = null; // if set, overrides all room categories

// Replaced usedChallenges with usageTracker

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

const usageTracker = require('./utils/usageTracker');

// We use the room object to get roomId and players
function getRandomChallenge(N, room, tier = 'easy') {
  const targetDomain = eventTheme || room.category;
  
  // Create a fast lookup grouped by domain -> subfield -> tier -> challenges
  // ONLY keywords with at least N clues are eligible
  const pool = {};
  challengesData.forEach(c => {
    const clueCount = Array.isArray(c.clues) ? c.clues.length : 0;
    if (clueCount >= N && !usageTracker.isSubfieldDisabled(c.category, c.subfield) && !usageTracker.isKeywordDisabled(c.id)) {
      if (!pool[c.category]) pool[c.category] = {};
      if (!pool[c.category][c.subfield]) pool[c.category][c.subfield] = { easy: [], medium: [], hard: [] };
      if (pool[c.category][c.subfield][c.tier]) {
         pool[c.category][c.subfield][c.tier].push(c);
      }
    }
  });

  // a. If Mixed, choose the domain used least recently event-wide.
  let selectedDomain = targetDomain;
  if (selectedDomain === 'Mixed' || selectedDomain === 'Random') {
    const domains = Object.keys(pool);
    domains.sort((a, b) => usageTracker.getDomainLastUsed(a) - usageTracker.getDomainLastUsed(b));
    selectedDomain = domains[0] || CATEGORIES[0];
  }
  
  if (!pool[selectedDomain]) {
    // fallback if everything is disabled
    selectedDomain = Object.keys(pool)[0]; 
    if (!selectedDomain) {
      const eligibleFallback = challengesData.filter(c => Array.isArray(c.clues) && c.clues.length >= N);
      return eligibleFallback[0] || challengesData[0]; // absolute fallback
    }
  }

  // b. Choose the sub-field within the domain that was used least recently event-wide.
  // Never the same sub-field as the previous round in that domain if another exists.
  let subfields = Object.keys(pool[selectedDomain]);
  const prevSubfield = usageTracker.getPreviousDomainSubfield(selectedDomain);
  if (subfields.length > 1 && prevSubfield) {
    subfields = subfields.filter(sf => sf !== prevSubfield);
  }
  
  // ties random -> sort by usage, then by Math.random for ties?
  // We can shuffle first, then sort by usage (stable sort behavior not guaranteed, so map to object)
  subfields.sort(() => 0.5 - Math.random());
  subfields.sort((a, b) => usageTracker.getSubfieldLastUsed(selectedDomain, a) - usageTracker.getSubfieldLastUsed(selectedDomain, b));
  
  const playerTokens = room.players.map(p => p.id);
  const roomId = room.id;
  const prevEventKeyword = usageTracker.getPreviousEventKeyword();
  
  let selectedChallenge = null;

  // c. Within the sub-field, filter by tier and enabled status.
  // If none, fall back to the nearest tier, then the next sub-field.
  for (const sf of subfields) {
    const sfChallenges = pool[selectedDomain][sf];
    const searchTiers = tier === 'easy' ? ['easy', 'medium', 'hard'] :
                        tier === 'medium' ? ['medium', 'easy', 'hard'] :
                        ['hard', 'medium', 'easy'];
    
    for (const t of searchTiers) {
      if (sfChallenges[t] && sfChallenges[t].length > 0) {
        
        let candidates = sfChallenges[t];
        
        // d. Choose randomly among keywords NOT yet used in this event
        // Never repeat a keyword within the same room
        if (!room.usedKeywords) room.usedKeywords = new Set();
        candidates = candidates.filter(c => !room.usedKeywords.has(c.id));
        
        // never the same keyword as the previous round event-wide
        candidates = candidates.filter(c => c.id !== prevEventKeyword);

        if (candidates.length === 0) continue; // move to next tier/subfield
        
        candidates.sort(() => 0.5 - Math.random());
        
        // Prefer keywords none of the current players have seen
        let unseenByPlayers = candidates.filter(c => !usageTracker.hasAnyPlayerSeen(c.id, playerTokens));
        
        // Relaxing that rule before the event-wide rule
        let finalCandidates = unseenByPlayers.length > 0 ? unseenByPlayers : candidates;
        
        // Choose among keywords NOT yet used in this event
        let notUsedInEvent = finalCandidates.filter(c => usageTracker.getKeywordCount(c.id) === 0);
        
        if (notUsedInEvent.length > 0) {
          selectedChallenge = notUsedInEvent[0];
        } else {
          // If all are used, choose the one with the oldest lastUsedAt
          finalCandidates.sort((a, b) => usageTracker.getKeywordLastUsed(a.id) - usageTracker.getKeywordLastUsed(b.id));
          selectedChallenge = finalCandidates[0];
        }

        if (selectedChallenge) {
           room.usedKeywords.add(selectedChallenge.id);
           usageTracker.recordUsage(selectedDomain, sf, selectedChallenge.id, playerTokens);
           return selectedChallenge;
        }
      }
    }
  }

  // Absolute fallback: must have at least N clues
  if (!selectedChallenge) {
    const eligibleFallback = challengesData.filter(c => Array.isArray(c.clues) && c.clues.length >= N);
    selectedChallenge = eligibleFallback[Math.floor(Math.random() * eligibleFallback.length)] || challengesData[0];
    if (!room.usedKeywords) room.usedKeywords = new Set();
    room.usedKeywords.add(selectedChallenge.id);
    usageTracker.recordUsage(selectedChallenge.category, selectedChallenge.subfield, selectedChallenge.id, playerTokens);
  }
  return selectedChallenge;
}

class GameManager {
  createRoom(mode = 'quick', teamName = '') {
    if (rooms.size >= MAX_ROOMS) {
      throw new Error('Maximum room limit reached');
    }
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const cleanTeam = mode === 'event' ? (teamName || '').trim().slice(0, 20) : '';

    const room = {
      id: code,
      players: [],
      host: null,
      state: 'lobby',
      score: 0,
      lastActive: Date.now(),
      category: 'Mixed',
      timer: null,
      roundRules: null, // locked at round start
      teamSize: 0,
      mode: mode === 'event' || mode === 'duel_team' ? mode : 'quick',
      teamName: cleanTeam,
      isPractice: false,
      currentRound: 1,
      totalRounds: mode === 'event' ? EVENT_ROUNDS : 1,
      roundPlayStartTime: 0,
      revealEndTime: 0,
      lastRevealData: null,
      eventFinalResult: null,
      onRoundEndCallback: null,
    };

    if (mode === 'event') {
      const reg = eventManager.registerTeamRoom(code, cleanTeam);
      room.teamName = reg.teamName;
      room.isPractice = reg.isPractice;
    }

    rooms.set(code, room);
    this.refreshRoomTimeout(code);
    return code;
  }

  getRoom(code) {
    if (code) code = code.toUpperCase();
    return rooms.get(code);
  }

  refreshRoomTimeout(code) {
    const room = rooms.get(code);
    if (!room) return;
    room.lastActive = Date.now();
    if (room.timeout) clearTimeout(room.timeout);
    room.timeout = setTimeout(() => {
      this.deleteRoom(code);
    }, ROOM_TIMEOUT);
  }

  deleteRoom(code) {
    const room = rooms.get(code);
    if (room) {
      if (room.timeout) clearTimeout(room.timeout);
      if (room.timer) clearTimeout(room.timer);
      if (Array.isArray(room.waveTimers)) room.waveTimers.forEach(timer => clearTimeout(timer));
    }
    rooms.delete(code);
  }

  joinRoom(code, nickname, token = null) {
    code = code.toUpperCase();
    const room = this.getRoom(code);
    if (!room) return { error: 'Room not found' };

    if (token && userTokens.has(token)) {
      const pData = userTokens.get(token);
      if (pData.roomId === code) {
        const p = room.players.find(pl => pl.id === pData.playerId);
        if (p) {
          p.connected = true;
          if (room.mode === 'event') {
            eventManager.handleTeamReconnect(code);
          }
          this.refreshRoomTimeout(code);
          return { room, player: p, token };
        }
      }
    }

    const activePlayers = room.players.filter(p => p.connected).length;
    if (activePlayers >= MAX_PLAYERS) return { error: `Room is full (max ${MAX_PLAYERS} players)` };
    if (room.mode === 'event') {
      const maxEventPlayers = eventManager.getEvent()?.maxPlayersPerTeam || MAX_PLAYERS;
      if (activePlayers >= maxEventPlayers) {
        return { error: `Team is full (max ${maxEventPlayers} players for this event)` };
      }
    }
    if (room.state !== 'lobby') return { error: 'Game already in progress' };

    const playerId = generateToken();
    const newToken = generateToken();
    const newPlayer = {
      id: playerId,
      name: nickname,
      connected: true,
      clue: null
    };

    room.players.push(newPlayer);
    userTokens.set(newToken, { roomId: code, playerId: playerId });

    if (!room.host) {
      room.host = playerId;
    }

    this.refreshRoomTimeout(code);
    return { room, player: newPlayer, token: newToken };
  }

  registerPlayerToken(code, token, playerId) {
    const room = this.getRoom(code);
    const player = room?.players.find(candidate => candidate.id === playerId);
    if (!room || !token || !player) return false;
    player.token = token;
    userTokens.set(token, { roomId: room.id, playerId });
    return true;
  }

  leaveRoom(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const p = room.players.find(pl => pl.id === playerId);
    if (p) p.connected = false;

    // Check if any players are still connected
    const connectedCount = room.players.filter(pl => pl.connected).length;
    if (connectedCount === 0 && room.mode === 'event') {
      eventManager.handleTeamDisconnect(code, (action, roomId) => {
        if (action === 'active_incomplete') {
          const r = this.getRoom(roomId);
          if (r && r.state !== 'event_finished') {
            r.state = 'event_finished';
            r.eventFinalResult = {
              status: 'incomplete',
              rank: eventManager.getTeamRank(roomId),
              gap: eventManager.getGapToNextTeam(roomId),
            };
            this.checkAndStartNextQueuedTeam();
            if (r.onRoundEndCallback) r.onRoundEndCallback(r, 'event_finished');
          }
        } else if (action === 'queue_removed') {
          this.checkAndStartNextQueuedTeam();
        }
      });
    }

    if (room.host === playerId) {
      const nextHost = room.players.find(pl => pl.connected);
      room.host = nextHost ? nextHost.id : null;
    }

    return room;
  }

  setCategory(code, category, playerId) {
    const room = this.getRoom(code);
    if (!room || room.host !== playerId) return null;
    // Overridden by eventTheme during gameplay, but we store their choice
    room.category = category;
    this.refreshRoomTimeout(code);
    return room;
  }

  startGame(code, playerId, onRoundEnd, onClueWave) {
    const room = this.getRoom(code);
    if (!room || room.host !== playerId || (room.state !== 'lobby' && room.state !== 'queued')) {
      return { error: 'Cannot start game' };
    }
    
    const activePlayers = room.players.filter(p => p.connected);
    const N = activePlayers.length;
    if (N < MIN_PLAYERS || N > MAX_PLAYERS) return { error: `Need ${MIN_PLAYERS}-${MAX_PLAYERS} players` };

    if (room.mode === 'event') {
      const minEventPlayers = eventManager.getEvent()?.minPlayersPerTeam || MIN_PLAYERS;
      if (N < minEventPlayers) {
        return { error: `Need at least ${minEventPlayers} players for this event` };
      }
    }

    const rules = getRulesForPlayerCount(N);
    if (!rules) return { error: 'Invalid player count for rules' };

    room.roundRules = rules; // Lock rules for the round
    room.teamSize = N;
    if (onRoundEnd) room.onRoundEndCallback = onRoundEnd;
    if (onClueWave) room.onClueWaveCallback = onClueWave;
    else if (this.globalClueWaveCallback) room.onClueWaveCallback = this.globalClueWaveCallback;

    // EVENT MODE CAPACITY & QUEUE CHECK
    if (room.mode === 'event') {
      if (!eventManager.isLive()) {
        return { error: 'No live event in progress' };
      }

      if (!eventManager.activeTeams.has(code)) {
        if (!eventManager.canStartTeamImmediately()) {
          room.state = 'queued';
          room.queuePosition = eventManager.enqueueTeam(code, room.teamName);
          return { room, queued: true, queuePosition: room.queuePosition };
        }
        eventManager.activateTeam(code);
      }
    }

    return this.launchRound(room, room.currentRound || 1);
  }

  launchRound(room, roundNum) {
    const N = room.teamSize;
    let challenge;

    if (room.mode === 'event') {
      challenge = eventManager.getTeamKeywordForRound(room.id, roundNum);
      if (!challenge) {
        challenge = getRandomChallenge(N, room, room.roundRules.difficultyTier);
      }
    } else {
      challenge = getRandomChallenge(N, room, room.roundRules.difficultyTier);
    }

    room.state = 'ready';
    room.currentChallenge = challenge;
    room.hintsUsed = 0;
    room.wrongAttempts = 0;
    room.sharedHint = null;

    const activePlayers = room.players.filter(p => p.connected);

    // Clear any previous wave timers
    if (room.waveTimers) {
      room.waveTimers.forEach(t => clearTimeout(t));
    }
    room.waveTimers = [];

    // Distribute all clues across N players using dealClues
    const piles = dealClues(challenge, N);

    const waveInterval = room.roundRules.waveIntervalSeconds !== undefined ? room.roundRules.waveIntervalSeconds : 0;
    const maxPileSize = Math.max(...piles.map(p => p.length));
    room.totalWaves = maxPileSize;
    room.currentWave = waveInterval === 0 ? 1 : 0;
    room.waveIntervalSeconds = waveInterval;

    for (let i = 0; i < N; i++) {
      if (activePlayers[i]) {
        activePlayers[i].fullCluePile = piles[i];
        if (waveInterval === 0) {
          activePlayers[i].releasedClues = [...piles[i]];
          activePlayers[i].clue = piles[i][0]?.text || '';
        } else {
          activePlayers[i].releasedClues = [];
          activePlayers[i].clue = '';
        }
      }
    }

    // Hints fallback
    room.unassignedClues = [];

    const now = Date.now();
    const totalMs = room.roundRules.roundSeconds * 1000;
    const prepMs = room.roundRules.prepSeconds * 1000;

    room.readyEndTime = now + prepMs;
    room.roundEndTime = now + totalMs; // Total time since start
    
    if (room.timer) clearTimeout(room.timer);
    
    room.timer = setTimeout(() => {
      room.state = 'playing';
      room.roundPlayStartTime = Date.now();

      // Release Wave 1 for progressive release
      if (waveInterval > 0) {
        room.currentWave = 1;
        for (let i = 0; i < N; i++) {
          const p = activePlayers[i];
          if (p && p.fullCluePile && p.fullCluePile.length >= 1) {
            p.releasedClues = [p.fullCluePile[0]];
            p.clue = p.fullCluePile[0].text;
          }
        }
      }

      if (room.onRoundEndCallback) room.onRoundEndCallback(room, 'started');
      if (room.onClueWaveCallback) room.onClueWaveCallback(room, 1);

      // Schedule progressive waves if waveInterval > 0
      if (waveInterval > 0 && maxPileSize > 1) {
        for (let k = 2; k <= maxPileSize; k++) {
          const waveDelay = (k - 1) * waveInterval * 1000;
          const waveTimer = setTimeout(() => {
            if (room.state !== 'playing') return;
            room.currentWave = k;
            for (let i = 0; i < N; i++) {
              const p = activePlayers[i];
              if (p && p.fullCluePile && p.fullCluePile.length >= k) {
                p.releasedClues.push(p.fullCluePile[k - 1]);
                p.clue = p.fullCluePile[k - 1].text;
              }
            }
            if (room.onClueWaveCallback) room.onClueWaveCallback(room, k);
          }, waveDelay);
          room.waveTimers.push(waveTimer);
        }
      }
      
      const playMs = totalMs - prepMs;
      room.timer = setTimeout(() => {
        if (room.state === 'playing') {
          this.endRound(room.id, false, 'Time is up!');
          if (room.onRoundEndCallback) room.onRoundEndCallback(room, 'timeout');
        }
      }, playMs);
    }, prepMs);

    this.refreshRoomTimeout(room.id);
    return { room };
  }

  useHint(code) {
    const room = this.getRoom(code);
    if (!room || room.state !== 'playing') return null;
    
    if ((room.roundRules?.waveIntervalSeconds || 0) > 0 && (room.roundRules?.maxHints || 0) <= 0) {
      return { error: 'Progressive clue release is active — hints are disabled' };
    }

    if (room.hintsUsed >= (room.roundRules?.maxHints || 0)) {
      return { error: 'Max hints used or none available' };
    }

    if (!room.unassignedClues || room.unassignedClues.length === 0) {
      const cat = room.currentChallenge?.category || '';
      const sub = room.currentChallenge?.subfield ? ` (${room.currentChallenge.subfield})` : '';
      const ans = room.currentChallenge?.answer || '';
      room.unassignedClues = [
        `Category: ${cat}${sub}`,
        `Starts with: "${ans.charAt(0).toUpperCase()}"`,
      ];
    }

    if (room.unassignedClues.length === 0) {
      return { error: 'Max hints used or none available' };
    }
    
    room.hintsUsed++;
    room.sharedHint = room.unassignedClues.pop();
    return room;
  }

  checkAnswerMatch(guess, challenge, options = {}) {
    if (!challenge) return false;
    const match = isCorrectGuess(guess, challenge, options);
    return match.correct;
  }

  submitAnswer(code, playerId, guess) {
    const room = this.getRoom(code);
    if (!room || room.state !== 'playing') return { error: 'Not playing' };
    
    // Check if past deadline
    if (Date.now() > room.roundEndTime) {
      return this.endRound(code, false, 'Time is up!');
    }

    // Input validation: reject non-string guesses
    if (typeof guess !== 'string') {
      return { error: 'Invalid guess' };
    }

    // Rate limiting: max 1 submission per second per player
    const player = room.players.find(p => p.id === playerId);
    const now = Date.now();
    if (player) {
      if (player.lastSubmitAt && now - player.lastSubmitAt < 1000) {
        return { error: 'Too fast! Max 1 guess per second.' };
      }
      player.lastSubmitAt = now;
    }

    // Trim and cap length at MAX_GUESS_LENGTH
    const trimmedGuess = guess.trim().slice(0, MAX_GUESS_LENGTH);
    const guessNorm = normalize(trimmedGuess);

    // Reject empty guesses WITHOUT consuming an attempt
    if (!guessNorm) {
      return { error: 'Please enter a valid guess.' };
    }

    if (room.mode === 'duel_team' && room.duelCode) {
      const duelManager = require('./duelManager');
      const duelRes = duelManager.submitAnswer(room.duelCode, room.duelTeam, playerId, trimmedGuess);
      return {
        room,
        isCorrect: duelRes.isCorrect,
        winner: duelRes.winner,
        error: duelRes.error || (duelRes.isCorrect ? null : (duelRes.near ? 'So close! Check your spelling.' : 'Incorrect answer')),
        near: duelRes.near,
      };
    }

    const matchResult = isCorrectGuess(trimmedGuess, room.currentChallenge);
    if (matchResult.correct) {
      return this.endRound(code, true, 'Correct!');
    } else {
      room.wrongAttempts++;
      if (room.wrongAttempts >= room.roundRules.maxAttempts) {
        return this.endRound(code, false, 'Too many wrong attempts!');
      }

      const message = matchResult.near
        ? 'So close! Check your spelling.'
        : 'Incorrect answer';

      return {
        room,
        isCorrect: false,
        error: message,
        near: matchResult.near,
      };
    }
  }

  checkAndStartNextQueuedTeam() {
    if (!eventManager.isLive()) return;
    while (eventManager.canStartTeamImmediately() && eventManager.queuedTeams.length > 0) {
      const next = eventManager.getNextQueuedTeam();
      if (!next) break;
      const nextRoom = this.getRoom(next.roomId);
      if (nextRoom && nextRoom.players.filter(p => p.connected).length >= MIN_PLAYERS) {
        eventManager.activateTeam(nextRoom.id);
        this.launchRound(nextRoom, 1);
        if (nextRoom.onRoundEndCallback) {
          nextRoom.onRoundEndCallback(nextRoom, 'started');
        }
      }
    }
  }

  endRound(code, success, reason) {
    const room = this.getRoom(code);
    if (!room) return null;
    
    if (room.timer) clearTimeout(room.timer);
    if (room.waveTimers) {
      room.waveTimers.forEach(t => clearTimeout(t));
      room.waveTimers = [];
    }

    // Build complete list of all clues paired with player nicknames
    const allCluesList = [];
    room.players.forEach(p => {
      const pile = p.fullCluePile && p.fullCluePile.length > 0 ? p.fullCluePile : (p.clue ? [{ text: p.clue }] : []);
      pile.forEach(c => {
        allCluesList.push({
          name: p.name,
          clue: typeof c === 'string' ? c : c.text,
        });
      });
    });
    room.lastRoundAllClues = allCluesList;

    // EVENT MODE ROUND END
    if (room.mode === 'event') {
      const now = Date.now();
      const secondsUsed = success
        ? Math.max(1, Math.round((now - (room.roundPlayStartTime || (now - 1000))) / 1000))
        : (room.roundRules?.roundSeconds || 120);

      const roundResult = eventManager.recordRoundResult(room.id, room.currentRound, {
        answer: room.currentChallenge?.answer,
        solved: success,
        secondsUsed,
        wrongAttempts: room.wrongAttempts,
        hintsUsed: room.hintsUsed,
      });

      room.state = 'reveal';
      room.revealEndTime = now + (REVEAL_DURATION_SECONDS * 1000);
      room.lastRevealData = {
        answer: room.currentChallenge?.answer,
        allClues: allCluesList,
        roundNum: room.currentRound,
        totalRounds: EVENT_ROUNDS,
        roundTime: roundResult?.roundTime || 0,
        secondsUsed,
        wrongAttempts: room.wrongAttempts,
        hintsUsed: room.hintsUsed,
        currentRank: eventManager.getTeamRank(room.id),
        solved: success,
        reason,
      };

      if (room.onRoundEndCallback) {
        room.onRoundEndCallback(room, 'reveal');
      }

      // Schedule post-reveal transition after 6 seconds
      room.timer = setTimeout(() => {
        if (room.currentRound < EVENT_ROUNDS) {
          room.currentRound++;
          this.launchRound(room, room.currentRound);
          if (room.onRoundEndCallback) {
            room.onRoundEndCallback(room, 'next_round_started');
          }
        } else {
          // Finished all 3 rounds!
          room.state = 'event_finished';
          const memberNames = room.players.filter(p => p.connected).map(p => p.name);
          const finalInfo = eventManager.completeTeamRun(room.id, memberNames, room.teamSize);
          room.eventFinalResult = {
            ...finalInfo,
            totalRounds: EVENT_ROUNDS,
          };

          // Free slot and advance queue
          this.checkAndStartNextQueuedTeam();

          if (room.onRoundEndCallback) {
            room.onRoundEndCallback(room, 'event_finished');
          }
        }
      }, REVEAL_DURATION_SECONDS * 1000);

      this.refreshRoomTimeout(code);
      return { room, success, reason, state: 'reveal', revealData: room.lastRevealData };
    }

    // QUICK PLAY
    room.state = 'finished';
    
    const timeRemaining = Math.max(0, Math.floor((room.roundEndTime - Date.now()) / 1000));
    
    let baseScore = 0;
    let timeBonus = 0;
    let hintPenaltyTotal = 0;
    let wrongPenaltyTotal = 0;
    let finalScore = 0;

    if (success) {
      baseScore = 100;
      if (timeRemaining > 0) {
        // scale remaining time to 10-50 bonus
        timeBonus = Math.floor((timeRemaining / room.roundRules.roundSeconds) * 40) + 10;
      }
      
      hintPenaltyTotal = room.hintsUsed * room.roundRules.hintPenalty;
      wrongPenaltyTotal = room.wrongAttempts * room.roundRules.wrongPenalty;
      
      let rawScore = baseScore + timeBonus - hintPenaltyTotal - wrongPenaltyTotal;
      finalScore = Math.max(0, Math.round(rawScore * room.roundRules.scoreMultiplier));
      
      room.score += finalScore;

      const teamNames = room.players.filter(p => p.connected).map(p => p.name).join(', ');
      leaderboard.push({
        id: Math.random().toString(36).substr(2, 9),
        names: teamNames,
        score: room.score,
        date: Date.now(),
        teamSize: room.teamSize,
      });
      leaderboard.sort((a, b) => b.score - a.score);
      if (leaderboard.length > 50) leaderboard.length = 50;
    }
    
    room.lastRoundScoreBreakdown = {
      baseScore,
      timeBonus,
      hintPenalty: -hintPenaltyTotal,
      wrongPenalty: -wrongPenaltyTotal,
      multiplier: room.roundRules.scoreMultiplier,
      finalScore
    };
    room.lastRoundSuccess = success;
    room.lastRoundReason = reason;

    return { room, success, score: finalScore, reason };
  }

  nextRound(code, playerId) {
    const room = this.getRoom(code);
    if (!room || room.host !== playerId) return { error: 'Not authorized' };
    room.state = 'lobby';
    room.currentChallenge = null;
    room.roundRules = null;
    this.refreshRoomTimeout(code);
    return room;
  }

  getLeaderboard() {
    return leaderboard;
  }

  resetLeaderboard() {
    leaderboard.length = 0;
  }

  getActiveRooms() {
    return Array.from(rooms.values()).map(r => ({
      id: r.id,
      playersCount: r.players.filter(p => p.connected).length,
      state: r.state
    }));
  }

  setEventTheme(theme) {
    eventTheme = theme;
  }

  getEventTheme() {
    return eventTheme;
  }

  scheduleClueWaves(room, waveIntervalSeconds, totalWaves) {
    if (room.waveTimers) {
      room.waveTimers.forEach(t => clearTimeout(t));
    }
    room.waveTimers = [];

    const N = room.players.length;
    for (let k = 2; k <= totalWaves; k++) {
      const waveDelay = (k - 1) * waveIntervalSeconds * 1000;
      const waveTimer = setTimeout(() => {
        if (room.state !== 'playing') return;
        room.currentWave = k;
        for (let i = 0; i < N; i++) {
          const p = room.players[i];
          if (p && p.fullCluePile && p.fullCluePile.length >= k) {
            p.releasedClues.push(p.fullCluePile[k - 1]);
            p.clue = p.fullCluePile[k - 1].text;
          }
        }
        if (this.globalClueWaveCallback) {
          this.globalClueWaveCallback(room, k);
        }
      }, waveDelay);
      room.waveTimers.push(waveTimer);
    }
  }

  setClueWaveCallback(callback) {
    this.globalClueWaveCallback = callback;
  }

  getCategoryWarnings() {
    const warnings = [];
    CATEGORIES.forEach(category => {
      const catChallenges = challengesData.filter(c => c.category === category && Array.isArray(c.clues));
      for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
        const eligibleCount = catChallenges.filter(c => c.clues.length >= n).length;
        if (eligibleCount < 3) {
          warnings.push({
            category,
            playerCount: n,
            available: eligibleCount,
            message: `Category "${category}" has only ${eligibleCount} keyword(s) with at least ${n} clues (minimum 3 required for a standard match).`
          });
        }
      }
    });
    return warnings;
  }

  getRandomChallenge(N, room, tier = 'easy') {
    return getRandomChallenge(N, room, tier);
  }

  getChallengesData() {
    return challengesData;
  }
}

module.exports = new GameManager();
