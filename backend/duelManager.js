const fs = require('fs');
const path = require('path');
const {
  DUEL_MIN_PLAYERS,
  DUEL_MAX_PLAYERS,
  DUEL_ALLOWED_PLAYER_COUNTS,
  DUEL_DEFAULT_EXPECTED_PLAYERS,
  TEAM_MIN_PLAYERS,
  TEAM_MAX_PLAYERS,
  DUEL_ROUNDS_PER_TEAM,
  DUEL_TARGET_SOLVES,
  DUEL_KEYWORD_TIME_CAP,
  DUEL_REVEAL_SECONDS,
  DUEL_COUNTDOWN_SECONDS,
  DUEL_MEET_TEAM_SECONDS,
  DUEL_QUEUE_DISCONNECT_TIMEOUT_MS,
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
  prizeBanner: DEFAULT_PRIZE_BANNER,
  tieBreaker: DEFAULT_TIE_BREAKER,
};

// Optional Redis client if REDIS_URL is provided
let redisClient = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on('error', (err) => console.error('Duel Redis error:', err.message));
  } catch (e) {
    console.warn('Redis client not installed or failed to initialize, using file persistence.');
  }
}

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

  // Note: The in-memory duels Map is always empty on server restart (not persisted),
  // so no cleanup needed for it. Active duels are lost on restart by design.

  // CRITICAL: Keep at most 100 duels (trim when length > 100)
  if (finishedDuelsArchive.length > 100) {
    const originalLength = finishedDuelsArchive.length;
    finishedDuelsArchive = finishedDuelsArchive.slice(-100);
    saveDuelData(); // Persist trimmed archive immediately
    console.log(`[Startup] Trimmed archive from ${originalLength} to 100 duels`);
  }

  console.log(`[Startup] Loaded ${finishedDuelsArchive.length} finished duels, ${duels.size} active duels`);
}

function saveDuelData() {
  try {
    const data = {
      finishedDuels: finishedDuelsArchive.slice(-100),
      adminSettings,
    };
    fs.writeFileSync(DUEL_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');

    if (redisClient) {
      redisClient.set('onebrain:duel_data', JSON.stringify(data)).catch(() => {});
    }
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

function sanitizeName(name, defaultName = 'Player') {
  if (!name || typeof name !== 'string') return defaultName;

  // Trim whitespace and limit to max length
  let clean = name.trim().slice(0, TEAM_NAME_MAX_LENGTH);

  // Remove HTML brackets and quotes to prevent XSS
  clean = clean.replace(/<[^>]*>/g, '').replace(/[<>'"]/g, '');

  // If empty after sanitization, use default
  if (clean.length === 0) return defaultName;

  return clean;
}

class DuelManager {
  constructor() {
    this.gameManager = null; // injected
    this.io = null; // injected
    this.onTeamRoomUpdate = null; // injected
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

  updateAdminSettings({ prizeBanner, tieBreaker }) {
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
    const liveDuelsCount = Array.from(duels.values()).filter(d =>
      d.status === 'lobby' || d.status === 'countdown' || d.status === 'team_reveal' || d.status === 'in_progress'
    ).length;
    return {
      activeRooms: activeRoomsCount,
      liveDuels: liveDuelsCount,
      maxRooms: MAX_ROOMS,
      capacityAvailable: activeRoomsCount + 2 <= MAX_ROOMS,
    };
  }

  createDuel(hostNickname, expectedPlayers = DUEL_DEFAULT_EXPECTED_PLAYERS) {
    const usage = this.getRoomUsage();
    if (usage.activeRooms + 2 > MAX_ROOMS) {
      throw new Error(`Maximum room limit reached (${MAX_ROOMS}). Cannot create new duel.`);
    }

    const n = parseInt(expectedPlayers, 10);
    if (isNaN(n) || !DUEL_ALLOWED_PLAYER_COUNTS.includes(n) || n % 2 !== 0) {
      throw new Error(`Expected players must be an even number between ${DUEL_MIN_PLAYERS} and ${DUEL_MAX_PLAYERS} (${DUEL_ALLOWED_PLAYER_COUNTS.join(', ')}).`);
    }

    let code;
    do {
      code = generateDuelCode();
    } while (duels.has(code) || (this.gameManager && this.gameManager.getRoom(code)));

    const hostToken = generateToken();
    const hostPlayerId = 'p_' + Math.random().toString(36).substr(2, 9);
    const cleanNick = sanitizeName(hostNickname, 'Host');

    const duel = {
      code,
      hostId: hostPlayerId,
      status: 'lobby', // 'lobby' | 'countdown' | 'team_reveal' | 'in_progress' | 'finished' | 'cancelled'
      expectedPlayers: n,
      countdownRemaining: 0,
      countdownTimer: null,
      meetTeamTimer: null,
      players: [
        {
          id: hostPlayerId,
          name: cleanNick,
          token: hostToken,
          team: null,
          connected: true,
          socketId: null,
          joinedAt: Date.now(),
          queueDisconnectTimer: null,
        }
      ],
      teamRed: {
        id: 'red',
        name: DEFAULT_TEAM_RED_NAME,
        playerIds: [],
        roomId: null,
        solvedCount: 0,
        finishTime: null, // Seconds from common start at end of round 3
        finishTimestamp: null,
        totalWrongAttempts: 0,
        roundsPlayed: 0,
        currentRound: 1,
        currentKeyword: null,
        currentKeywordStartTime: 0,
        currentKeywordIndex: 0,
        history: [], // [{ roundNum, keywordId, answer, category, solved, solveTime, wrongAttempts }]
        disconnectTimer: null,
        keywordTimer: null,
        revealTimer: null,
        inReveal: false,
        finished: false,
        waitingForOpponent: false,
      },
      teamBlue: {
        id: 'blue',
        name: DEFAULT_TEAM_BLUE_NAME,
        playerIds: [],
        roomId: null,
        solvedCount: 0,
        finishTime: null,
        finishTimestamp: null,
        totalWrongAttempts: 0,
        roundsPlayed: 0,
        currentRound: 1,
        currentKeyword: null,
        currentKeywordStartTime: 0,
        currentKeywordIndex: 0,
        history: [],
        disconnectTimer: null,
        keywordTimer: null,
        revealTimer: null,
        inReveal: false,
        finished: false,
        waitingForOpponent: false,
      },
      keywords: [], // Exactly 3 keywords chosen
      teamRedSequence: [],
      teamBlueSequence: [],
      startTime: null,
      endTime: null,
      prizeBanner: adminSettings.prizeBanner,
      winner: null, // 'red', 'blue', 'draw'
      winnerReason: null, // 'instant_3_solves', 'more_solves', 'tie_breaker_time', 'tie_breaker_wrong', 'draw', 'forfeit', 'admin_ended'
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

    const cleanNick = sanitizeName(nickname, 'Player');

    // 1. Reconnect with existing token
    if (token) {
      const existing = duel.players.find(p => p.token === token);
      if (existing) {
        existing.connected = true;
        duel.lastActiveAt = Date.now();

        // Clear queue disconnect timer if running
        if (existing.queueDisconnectTimer) {
          clearTimeout(existing.queueDisconnectTimer);
          existing.queueDisconnectTimer = null;
        }

        // Cancel team disconnect timer if running in active match
        const teamObj = existing.team === 'red' ? duel.teamRed : existing.team === 'blue' ? duel.teamBlue : null;
        if (teamObj && teamObj.disconnectTimer) {
          clearTimeout(teamObj.disconnectTimer);
          teamObj.disconnectTimer = null;
        }

        return { success: true, duel, player: existing, token: existing.token };
      }
    }

    // 2. Reject join if duel already started or finished
    if (duel.status !== 'lobby' && duel.status !== 'countdown') {
      return { error: 'Duel already started' };
    }

    // 3. Reject if queue is full
    if (duel.players.length >= duel.expectedPlayers) {
      return { error: 'Duel full' };
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
      queueDisconnectTimer: null,
    };

    duel.players.push(newPlayer);
    duel.lastActiveAt = Date.now();

    // Check if queue has reached expectedPlayers -> trigger 5-second countdown
    if (duel.players.length === duel.expectedPlayers) {
      this.startQueueCountdown(duel);
    }

    return { success: true, duel, player: newPlayer, token: newToken };
  }

  leaveDuel(code, playerId) {
    const duel = this.getDuel(code);
    if (!duel) return null;

    const player = duel.players.find(p => p.id === playerId);
    if (!player) return duel;

    player.connected = false;
    duel.lastActiveAt = Date.now();

    if (duel.status === 'lobby' || duel.status === 'countdown') {
      if (duel.hostId === playerId) {
        const nextHost = duel.players.find(candidate => candidate.id !== playerId && candidate.connected);
        if (nextHost) duel.hostId = nextHost.id;
      }
      // Start 30-second disconnect removal timer for queue
      if (!player.queueDisconnectTimer) {
        player.queueDisconnectTimer = setTimeout(() => {
          this.removePlayer(code, duel.hostId, playerId, true);
        }, DUEL_QUEUE_DISCONNECT_TIMEOUT_MS);
      }
    } else if (duel.status === 'in_progress' || duel.status === 'team_reveal') {
      // In-progress: check if entire team is disconnected
      const teamKey = player.team;
      const teamObj = teamKey === 'red' ? duel.teamRed : teamKey === 'blue' ? duel.teamBlue : null;
      if (teamObj) {
        const teamPlayers = duel.players.filter(p => teamObj.playerIds.includes(p.id));
        const allDisconnected = teamPlayers.every(p => !p.connected);
        if (allDisconnected && !teamObj.disconnectTimer) {
          // 60-second forfeit timer
          teamObj.disconnectTimer = setTimeout(() => {
            this.handleTeamForfeit(duel.code, teamKey);
          }, DUEL_TEAM_DISCONNECT_FORFEIT_MS);
        }
      }
    }

    return duel;
  }

  removePlayer(code, hostId, playerIdToRemove, isAutoDisconnect = false) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };

    if (!isAutoDisconnect && duel.hostId !== hostId) {
      return { error: 'Only the host can remove players' };
    }

    if (duel.status !== 'lobby' && duel.status !== 'countdown') {
      return { error: 'Players can only be removed before the duel starts' };
    }

    if (playerIdToRemove === duel.hostId && !isAutoDisconnect) {
      return { error: 'Host cannot be removed' };
    }

    const playerIndex = duel.players.findIndex(p => p.id === playerIdToRemove);
    if (playerIndex === -1) return { error: 'Player not found' };

    const removedPlayer = duel.players[playerIndex];
    if (removedPlayer.queueDisconnectTimer) {
      clearTimeout(removedPlayer.queueDisconnectTimer);
      removedPlayer.queueDisconnectTimer = null;
    }

    duel.players.splice(playerIndex, 1);
    duel.lastActiveAt = Date.now();

    // If countdown was running and count is now below expectedPlayers, cancel countdown
    if (duel.status === 'countdown' && duel.players.length < duel.expectedPlayers) {
      this.cancelQueueCountdown(duel);
    }

    // If host left, reassign host or delete if empty
    if (playerIdToRemove === duel.hostId) {
      if (duel.players.length > 0) {
        duel.hostId = duel.players[0].id;
      } else {
        duels.delete(code);
        return { success: true, duelDeleted: true };
      }
    }

    this.broadcastLobbyState(duel);
    return { success: true, duel };
  }

  setExpectedPlayers(code, hostId, newExpectedCount) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can change player count' };
    if (duel.status !== 'lobby' && duel.status !== 'countdown') {
      return { error: 'Cannot change player count after duel has started' };
    }

    const count = parseInt(newExpectedCount, 10);
    if (isNaN(count) || !DUEL_ALLOWED_PLAYER_COUNTS.includes(count) || count % 2 !== 0) {
      return { error: `Allowed counts: ${DUEL_ALLOWED_PLAYER_COUNTS.join(', ')} (must be even numbers)` };
    }

    if (count < duel.players.length) {
      return { error: `Cannot lower to ${count}; ${duel.players.length} players have already joined. Remove players first.` };
    }

    duel.expectedPlayers = count;
    duel.lastActiveAt = Date.now();

    if (duel.players.length === duel.expectedPlayers) {
      this.startQueueCountdown(duel);
    } else if (duel.status === 'countdown') {
      this.cancelQueueCountdown(duel);
    }

    this.broadcastLobbyState(duel);
    return { success: true, duel };
  }

  startNow(code, hostId) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can start the duel' };

    // If already in team reveal, host can skip countdown and start match immediately
    if (duel.status === 'team_reveal') {
      if (duel.meetTeamTimer) {
        clearTimeout(duel.meetTeamTimer);
        duel.meetTeamTimer = null;
      }
      this.startMatch(duel);
      return { success: true, duel };
    }

    if (duel.status !== 'lobby' && duel.status !== 'countdown') {
      return { error: 'Duel is not in lobby state' };
    }

    const currentCount = duel.players.length;
    if (currentCount % 2 !== 0) {
      return { error: 'Waiting for 1 more player (or remove one) for equal teams' };
    }
    if (currentCount < DUEL_MIN_PLAYERS) {
      return { error: `Need at least ${DUEL_MIN_PLAYERS} players to start (currently ${currentCount})` };
    }

    duel.expectedPlayers = currentCount;
    if (duel.countdownTimer) clearTimeout(duel.countdownTimer);
    duel.countdownTimer = null;

    // Proceed directly to team split and 10s meet-your-team reveal
    return this.splitTeamsAndReveal(duel);
  }

  startQueueCountdown(duel) {
    if (duel.status === 'countdown') return;

    duel.status = 'countdown';
    duel.countdownRemaining = DUEL_COUNTDOWN_SECONDS;
    duel.countdownEndTime = Date.now() + (DUEL_COUNTDOWN_SECONDS * 1000);
    this.broadcastLobbyState(duel);

    duel.countdownTimer = setTimeout(() => {
      duel.countdownTimer = null;
      if (duel.status === 'countdown') {
        this.splitTeamsAndReveal(duel);
      }
    }, DUEL_COUNTDOWN_SECONDS * 1000);
  }

  cancelQueueCountdown(duel) {
    if (duel.countdownTimer) {
      clearTimeout(duel.countdownTimer);
      duel.countdownTimer = null;
    }
    duel.status = 'lobby';
    duel.countdownRemaining = 0;
    duel.countdownEndTime = null;
    this.broadcastLobbyState(duel);
  }

  renameTeams(code, hostId, teamRedName, teamBlueName) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };
    if (duel.hostId !== hostId) return { error: 'Only the host can rename teams' };
    if (duel.status !== 'lobby' && duel.status !== 'countdown') return { error: 'Teams can only be renamed before the duel starts' };

    const cleanRed = sanitizeName(teamRedName, DEFAULT_TEAM_RED_NAME);
    const cleanBlue = sanitizeName(teamBlueName, DEFAULT_TEAM_BLUE_NAME);

    duel.teamRed.name = cleanRed;
    duel.teamBlue.name = cleanBlue;

    duel.lastActiveAt = Date.now();
    this.broadcastLobbyState(duel);
    return { success: true, duel };
  }

  splitTeamsAndReveal(duel) {
    const count = duel.players.length;
    if (count % 2 !== 0 || count < DUEL_MIN_PLAYERS || count > DUEL_MAX_PLAYERS) {
      return { error: 'Cannot split into equal teams' };
    }

    const teamSize = count / 2; // Each team 2 to 8 players

    // Shuffle players randomly
    const shuffled = [...duel.players].sort(() => 0.5 - Math.random());
    const redPlayers = shuffled.slice(0, teamSize);
    const bluePlayers = shuffled.slice(teamSize);

    duel.teamRed.playerIds = redPlayers.map(p => p.id);
    duel.teamBlue.playerIds = bluePlayers.map(p => p.id);
    redPlayers.forEach(p => p.team = 'red');
    bluePlayers.forEach(p => p.team = 'blue');

    // Pick exactly 3 keywords
    let poolKeywords;
    try {
      poolKeywords = this.pickKeywords(teamSize);
    } catch (err) {
      return { error: err.message };
    }

    duel.keywords = poolKeywords;
    // Both teams play the same 3 keywords in different orders:
    // Red: [K0, K1, K2], Blue: [K1, K2, K0]
    duel.teamRedSequence = [poolKeywords[0], poolKeywords[1], poolKeywords[2]];
    duel.teamBlueSequence = [poolKeywords[1], poolKeywords[2], poolKeywords[0]];

    // Pre-create internal rooms in gameManager for both teams
    try {
      const redRoomCode = this.gameManager.createRoom('duel_team', duel.teamRed.name);
      const blueRoomCode = this.gameManager.createRoom('duel_team', duel.teamBlue.name);

      duel.teamRed.roomId = redRoomCode;
      duel.teamBlue.roomId = blueRoomCode;

      const redRoom = this.gameManager.getRoom(redRoomCode);
      const blueRoom = this.gameManager.getRoom(blueRoomCode);

      redRoom.duelCode = duel.code;
      redRoom.duelTeam = 'red';
      blueRoom.duelCode = duel.code;
      blueRoom.duelTeam = 'blue';

      redPlayers.forEach(p => {
        const joined = this.gameManager.joinRoom(redRoomCode, p.name, p.token);
        if (joined?.player) {
          p.teamRoomPlayerId = joined.player.id;
          this.gameManager.registerPlayerToken(redRoomCode, p.token, joined.player.id);
        }
      });
      bluePlayers.forEach(p => {
        const joined = this.gameManager.joinRoom(blueRoomCode, p.name, p.token);
        if (joined?.player) {
          p.teamRoomPlayerId = joined.player.id;
          this.gameManager.registerPlayerToken(blueRoomCode, p.token, joined.player.id);
        }
      });
    } catch (err) {
      return { error: `Failed to initialize internal rooms: ${err.message}` };
    }

    // Transition to 10-second "Meet your team" screen
    duel.status = 'team_reveal';
    duel.teamRevealEndTime = Date.now() + (DUEL_MEET_TEAM_SECONDS * 1000);
    duel.lastActiveAt = Date.now();

    this.broadcastLobbyState(duel);
    this.broadcastDuelUpdate(duel);

    duel.meetTeamTimer = setTimeout(() => {
      duel.meetTeamTimer = null;
      if (duel.status === 'team_reveal') {
        this.startMatch(duel);
      }
    }, DUEL_MEET_TEAM_SECONDS * 1000);

    return { success: true, duel };
  }

  pickKeywords(teamSize) {
    // Select 3 keywords that each have >= teamSize clues
    const eligible = challengesData.filter(c => Array.isArray(c.clues) && c.clues.length >= teamSize);

    if (eligible.length < DUEL_ROUNDS_PER_TEAM) {
      throw new Error(`Dataset cannot provide ${DUEL_ROUNDS_PER_TEAM} eligible keywords with at least ${teamSize} clues (only ${eligible.length} available).`);
    }

    // Prefer 8-clue keywords if available
    const eightClue = eligible.filter(c => c.clues.length >= 8);
    const candidatePool = eightClue.length >= DUEL_ROUNDS_PER_TEAM ? eightClue : eligible;

    // Distribute across categories
    const byCategory = {};
    candidatePool.forEach(c => {
      byCategory[c.category] = byCategory[c.category] || [];
      byCategory[c.category].push(c);
    });

    const categories = Object.keys(byCategory).sort(() => 0.5 - Math.random());
    const selected = [];
    const usedIds = new Set();

    let catIdx = 0;
    while (selected.length < DUEL_ROUNDS_PER_TEAM && candidatePool.length > usedIds.size) {
      const cat = categories[catIdx % categories.length];
      const available = (byCategory[cat] || []).filter(c => !usedIds.has(c.id));
      if (available.length > 0) {
        const pick = available[Math.floor(Math.random() * available.length)];
        selected.push(pick);
        usedIds.add(pick.id);
      }
      catIdx++;
    }

    if (selected.length < DUEL_ROUNDS_PER_TEAM) {
      throw new Error(`Could not assemble ${DUEL_ROUNDS_PER_TEAM} distinct keywords for the duel.`);
    }

    return selected.slice(0, DUEL_ROUNDS_PER_TEAM);
  }

  startMatch(duel) {
    if (duel.status !== 'team_reveal') return;

    duel.status = 'in_progress';
    const commonStartTime = Date.now();
    duel.startTime = commonStartTime;
    duel.lastActiveAt = commonStartTime;

    // Attach every connected duel player to their internal team room on the server.
    // This avoids a race where round state is emitted before clients request a join.
    if (this.io?.sockets?.sockets) {
      duel.players.forEach(player => {
        const roomId = player.team === 'red' ? duel.teamRed.roomId : duel.teamBlue.roomId;
        const roomPlayer = this.gameManager.getRoom(roomId)?.players.find(p => p.id === player.teamRoomPlayerId);
        const socket = player.socketId && this.io.sockets.sockets.get(player.socketId);
        if (!roomPlayer || !socket) return;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerId = roomPlayer.id;
        socket.duelCode = duel.code;
        socket.duelPlayerId = player.id;
        roomPlayer.connected = true;
        roomPlayer.socketId = socket.id;
      });
    }

    // Start Round 1 for both teams at the same server timestamp.
    this.startTeamRound(duel, 'red', 0, commonStartTime);
    this.startTeamRound(duel, 'blue', 0, commonStartTime);

    // Notify sockets to join team rooms
    if (this.io) {
      this.io.to(`duel_${duel.code}`).emit('duel_started', {
        duelCode: duel.code,
      });
    }

    this.broadcastLobbyState(duel);
  }

  startTeamRound(duel, teamKey, roundIndex, roundStartAt = Date.now()) {
    if (duel.status !== 'in_progress') return;

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    const sequence = teamKey === 'red' ? duel.teamRedSequence : duel.teamBlueSequence;

    if (roundIndex >= DUEL_ROUNDS_PER_TEAM) {
      // Team has completed all 3 rounds!
      team.finished = true;
      team.finishTime = Math.round((Date.now() - duel.startTime) / 1000);
      team.finishTimestamp = Date.now();
      team.waitingForOpponent = true;
      this.broadcastTeamState(duel, teamKey);
      this.checkBothTeamsFinished(duel);
      return;
    }

    const keyword = sequence[roundIndex];
    team.currentRound = roundIndex + 1;
    team.currentKeyword = keyword;
    team.currentKeywordIndex = roundIndex;
    team.currentKeywordStartTime = roundStartAt;
    team.inReveal = false;

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (!internalRoom) return;

    const N = internalRoom.players.length;
    const rules = getRulesForPlayerCount(N);

    internalRoom.currentChallenge = keyword;
    internalRoom.state = 'playing';
    internalRoom.roundRules = rules;
    internalRoom.wrongAttempts = 0;
    internalRoom.hintsUsed = 0;
    internalRoom.sharedHint = null;
    internalRoom.roundStartTime = roundStartAt;
    internalRoom.roundPlayStartTime = roundStartAt;
    internalRoom.roundEndTime = roundStartAt + (DUEL_KEYWORD_TIME_CAP * 1000);
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

    // Schedule progressive waves if applicable
    if (rules.waveIntervalSeconds > 0 && maxPileSize > 1) {
      this.gameManager.scheduleClueWaves(internalRoom, rules.waveIntervalSeconds, maxPileSize);
    }

    // 120s timer per keyword
    if (team.keywordTimer) clearTimeout(team.keywordTimer);
    team.keywordTimer = setTimeout(() => {
      this.handleRoundTimeout(duel.code, teamKey, roundIndex);
    }, DUEL_KEYWORD_TIME_CAP * 1000);

    this.broadcastTeamState(duel, teamKey);
    this.broadcastDuelUpdate(duel);
  }

  submitAnswer(duelCode, teamKey, playerId, guess) {
    const duel = this.getDuel(duelCode);
    if (!duel) return { error: 'Duel not found' };
    if (duel.status !== 'in_progress') return { error: 'Duel is not currently active' };

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.inReveal || team.finished) return { error: 'Round already ended' };

    const keyword = team.currentKeyword;
    if (!keyword) return { error: 'No active keyword' };

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (!internalRoom) return { error: 'Internal room not found' };

    const now = Date.now();
    const result = isCorrectGuess(guess, keyword);

    if (result.correct) {
      if (team.keywordTimer) clearTimeout(team.keywordTimer);

      const solveTime = Math.max(1, (now - team.currentKeywordStartTime) / 1000);
      team.solvedCount += 1;
      team.roundsPlayed += 1;

      team.history.push({
        roundNum: team.currentRound,
        keywordId: keyword.id,
        answer: keyword.answer,
        category: keyword.category,
        solved: true,
        solveTime,
        wrongAttempts: internalRoom.wrongAttempts || 0,
      });

      // INSTANT WIN: First team to solve all 3 keywords wins immediately!
      if (team.solvedCount >= DUEL_TARGET_SOLVES) {
        team.finishTime = Math.round((now - duel.startTime) / 1000);
        team.finishTimestamp = now;
        this.endDuelWithWinner(duel, teamKey, 'instant_3_solves');
        return { success: true, isCorrect: true, winner: teamKey, solvedCount: team.solvedCount };
      }

      // Check if team just finished round 3
      if (team.roundsPlayed >= DUEL_ROUNDS_PER_TEAM) {
        team.finishTime = Math.round((now - duel.startTime) / 1000);
        team.finishTimestamp = now;
        team.finished = true;
        this.triggerRoundReveal(duel, teamKey, keyword, true, true);
        return { success: true, isCorrect: true, solvedCount: team.solvedCount };
      }

      // Enter 6-second reveal screen before next round
      this.triggerRoundReveal(duel, teamKey, keyword, true, false);
      return { success: true, isCorrect: true, solvedCount: team.solvedCount };
    } else {
      internalRoom.wrongAttempts = (internalRoom.wrongAttempts || 0) + 1;
      team.totalWrongAttempts += 1;

      const maxAttempts = internalRoom.roundRules?.maxAttempts || 3;
      if (internalRoom.wrongAttempts >= maxAttempts) {
        if (team.keywordTimer) clearTimeout(team.keywordTimer);
        this.handleRoundFailure(duel, teamKey, 'max_attempts');
        return { success: true, isCorrect: false, exhausted: true, near: result.near };
      }

      this.broadcastTeamState(duel, teamKey);
      return { success: true, isCorrect: false, near: result.near, attemptsLeft: maxAttempts - internalRoom.wrongAttempts };
    }
  }

  handleRoundTimeout(duelCode, teamKey, roundIndex) {
    const duel = this.getDuel(duelCode);
    if (!duel || duel.status !== 'in_progress') return;

    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.currentKeywordIndex !== roundIndex || team.inReveal || team.finished) return;

    this.handleRoundFailure(duel, teamKey, 'timeout');
  }

  handleRoundFailure(duel, teamKey, reason) {
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    const keyword = team.currentKeyword;
    if (!keyword || team.inReveal || team.finished) return;

    const internalRoom = this.gameManager.getRoom(team.roomId);
    team.roundsPlayed += 1;

    team.history.push({
      roundNum: team.currentRound,
      keywordId: keyword.id,
      answer: keyword.answer,
      category: keyword.category,
      solved: false,
      solveTime: DUEL_KEYWORD_TIME_CAP,
      wrongAttempts: internalRoom ? internalRoom.wrongAttempts : 3,
      failReason: reason,
    });

    const isFinalRound = team.roundsPlayed >= DUEL_ROUNDS_PER_TEAM;
    if (isFinalRound) {
      team.finishTime = Math.round((Date.now() - duel.startTime) / 1000);
      team.finishTimestamp = Date.now();
      team.finished = true;
    }

    this.triggerRoundReveal(duel, teamKey, keyword, false, isFinalRound);
  }

  triggerRoundReveal(duel, teamKey, keyword, solved, isFinalRound) {
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    team.inReveal = true;

    const internalRoom = this.gameManager.getRoom(team.roomId);
    if (internalRoom) {
      internalRoom.state = 'reveal';
      internalRoom.lastRevealData = {
        roundNum: team.currentRound,
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

    if (team.revealTimer) clearTimeout(team.revealTimer);
    team.revealTimer = setTimeout(() => {
      team.revealTimer = null;
      team.inReveal = false;

      if (isFinalRound) {
        team.waitingForOpponent = true;
        this.broadcastTeamState(duel, teamKey);
        this.checkBothTeamsFinished(duel);
      } else {
        this.startTeamRound(duel, teamKey, team.currentKeywordIndex + 1);
      }
    }, DUEL_REVEAL_SECONDS * 1000);
  }

  checkBothTeamsFinished(duel) {
    if (duel.status !== 'in_progress') return;

    if (duel.teamRed.finished && duel.teamBlue.finished) {
      const red = duel.teamRed;
      const blue = duel.teamBlue;

      let winner = 'draw';
      let reason = 'draw';

      // 1. More solved keywords wins
      if (red.solvedCount > blue.solvedCount) {
        winner = 'red';
        reason = 'more_solves';
      } else if (blue.solvedCount > red.solvedCount) {
        winner = 'blue';
        reason = 'more_solves';
      } else {
        // 2. Tie: Earlier finishTime wins (measured at end of round 3)
        const redTime = red.finishTimestamp ?? (red.finishTime == null ? Infinity : red.finishTime * 1000);
        const blueTime = blue.finishTimestamp ?? (blue.finishTime == null ? Infinity : blue.finishTime * 1000);
        if (redTime < blueTime) {
          winner = 'red';
          reason = 'tie_breaker_time';
        } else if (blueTime < redTime) {
          winner = 'blue';
          reason = 'tie_breaker_time';
        } else {
          // 3. Tie: Fewer total wrong attempts wins
          if (red.totalWrongAttempts < blue.totalWrongAttempts) {
            winner = 'red';
            reason = 'tie_breaker_wrong';
          } else if (blue.totalWrongAttempts < red.totalWrongAttempts) {
            winner = 'blue';
            reason = 'tie_breaker_wrong';
          } else {
            // 4. Draw
            winner = 'draw';
            reason = 'draw';
          }
        }
      }

      this.endDuelWithWinner(duel, winner, reason);
    }
  }

  endDuelWithWinner(duel, winnerKey, reason) {
    if (duel.status === 'finished') return;

    duel.status = 'finished';
    duel.endTime = Date.now();
    duel.winner = winnerKey;
    duel.winnerReason = reason;

    // Stop both teams' active timers and reject further answers
    [duel.teamRed, duel.teamBlue].forEach(t => {
      if (t.keywordTimer) clearTimeout(t.keywordTimer);
      if (t.revealTimer) clearTimeout(t.revealTimer);
      if (t.disconnectTimer) clearTimeout(t.disconnectTimer);
      t.finished = true;
      if (!t.finishTime && duel.startTime) {
        t.finishTime = Math.round((duel.endTime - duel.startTime) / 1000);
      }
      if (!t.finishTimestamp && duel.startTime) t.finishTimestamp = duel.endTime;

      const r = this.gameManager.getRoom(t.roomId);
      if (r) {
        r.state = 'finished';

        // CRITICAL FIX (HIGH-1): Clear progressive wave timers (missing in current implementation)
        if (r.waveTimers && Array.isArray(r.waveTimers)) {
          r.waveTimers.forEach(timer => clearTimeout(timer));
          const clearedCount = r.waveTimers.length;
          r.waveTimers = [];
          if (clearedCount > 0) {
            console.log(`[Duel ${duel.code}] Cleared ${clearedCount} wave timers for Team ${t.id}`);
          }
        }
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

    const archiveRecord = {
      code: duel.code,
      status: 'finished',
      teamRedName: duel.teamRed.name,
      teamBlueName: duel.teamBlue.name,
      teamRedSolved: duel.teamRed.solvedCount,
      teamBlueSolved: duel.teamBlue.solvedCount,
      teamRedTime: duel.teamRed.finishTime || 0,
      teamBlueTime: duel.teamBlue.finishTime || 0,
      teamRedWrong: duel.teamRed.totalWrongAttempts,
      teamBlueWrong: duel.teamBlue.totalWrongAttempts,
      winner: duel.winner,
      winningTeamName: duel.winningTeamName,
      winnerReason: duel.winnerReason,
      winningPlayers: duel.winningPlayers,
      totalDurationSeconds: Math.round((duel.endTime - (duel.startTime || duel.createdAt)) / 1000),
      chocolateAwarded: duel.chocolateAwarded,
      finishedAt: duel.endTime,
    };

    finishedDuelsArchive.push(archiveRecord);
    saveDuelData();

    // Expire finished duel from memory after 30 minutes
    setTimeout(() => {
      duels.delete(duel.code);
    }, DUEL_MEMORY_EXPIRY_MS);

    // Broadcast final updates
    this.broadcastTeamState(duel, 'red');
    this.broadcastTeamState(duel, 'blue');
    this.broadcastDuelUpdate(duel);
    if (this.io) {
      this.io.emit('arena_update', this.getArenaData());
    }
  }

  handleTeamForfeit(duelCode, forfeitedTeamKey) {
    const duel = this.getDuel(duelCode);
    if (!duel || (duel.status !== 'in_progress' && duel.status !== 'team_reveal')) return;

    const winningTeamKey = forfeitedTeamKey === 'red' ? 'blue' : 'red';
    this.endDuelWithWinner(duel, winningTeamKey, 'forfeit');
  }

  markChocolateAwarded(code, awarded = true) {
    const duel = this.getDuel(code);
    if (duel) duel.chocolateAwarded = awarded;

    const archived = finishedDuelsArchive.find(d => d.code === code);
    if (archived) archived.chocolateAwarded = awarded;

    saveDuelData();
    if (this.io) this.io.emit('arena_update', this.getArenaData());
    return { success: true, code, chocolateAwarded: awarded };
  }

  cancelDuel(code) {
    const duel = this.getDuel(code);
    if (!duel) return { error: 'Duel not found' };

    duel.status = 'cancelled';
    if (duel.countdownTimer) clearTimeout(duel.countdownTimer);
    if (duel.meetTeamTimer) clearTimeout(duel.meetTeamTimer);
    if (duel.teamRed.keywordTimer) clearTimeout(duel.teamRed.keywordTimer);
    if (duel.teamBlue.keywordTimer) clearTimeout(duel.teamBlue.keywordTimer);
    duel.players.forEach(player => {
      if (player.queueDisconnectTimer) clearTimeout(player.queueDisconnectTimer);
      player.queueDisconnectTimer = null;
    });
    [duel.teamRed, duel.teamBlue].forEach(team => {
      if (team.disconnectTimer) clearTimeout(team.disconnectTimer);
      if (team.revealTimer) clearTimeout(team.revealTimer);
    });

    [duel.teamRed.roomId, duel.teamBlue.roomId].forEach(rid => {
      if (rid && this.gameManager) this.gameManager.deleteRoom(rid);
    });

    duels.delete(code);
    if (this.io) this.io.emit('arena_update', this.getArenaData());
    return { success: true };
  }

  // Safe client state payload (ZERO LEAKS)
  getClientDuelState(code, playerToken = null) {
    const duel = this.getDuel(code);
    if (!duel) return null;

    const player = duel.players.find(p => p.token === playerToken);
    if (!player && !['lobby', 'countdown'].includes(duel.status)) return null;
    const playerTeam = player ? player.team : null;

    const elapsedSeconds = duel.startTime
      ? Math.round(((duel.endTime || Date.now()) - duel.startTime) / 1000)
      : 0;

    const prizeBanner = duel.prizeBanner.replace('{team}', duel.winningTeamName || '');

    const baseState = {
      code: duel.code,
      status: duel.status,
      hostId: duel.hostId,
      expectedPlayers: duel.expectedPlayers,
      joinedCount: duel.players.length,
      elapsedSeconds,
      startTime: duel.startTime,
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

    if (duel.status === 'lobby' || duel.status === 'countdown') {
      return {
        ...baseState,
        countdownRemaining: duel.countdownRemaining,
        countdownEndTime: duel.countdownEndTime,
        players: duel.players.map(p => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          isHost: p.id === duel.hostId,
        })),
        canStartNow: duel.players.length >= DUEL_MIN_PLAYERS && duel.players.length % 2 === 0,
      };
    }

    if (duel.status === 'team_reveal') {
      const isRed = playerTeam === 'red';
      const myTeam = isRed ? duel.teamRed : duel.teamBlue;
      const opponentTeam = isRed ? duel.teamBlue : duel.teamRed;

      return {
        ...baseState,
        myTeamKey: playerTeam,
        myTeamName: myTeam.name,
        opponentTeamName: opponentTeam.name,
        myTeamPlayerCount: myTeam.playerIds.length,
        opponentTeamPlayerCount: opponentTeam.playerIds.length,
        teamRed: {
          name: duel.teamRed.name,
          players: duel.players
            .filter(p => p.team === 'red')
            .map(p => ({ id: p.id, name: p.name, isYou: p.id === player?.id })),
        },
        teamBlue: {
          name: duel.teamBlue.name,
          players: duel.players
            .filter(p => p.team === 'blue')
            .map(p => ({ id: p.id, name: p.name, isYou: p.id === player?.id })),
        },
        teammates: duel.players
          .filter(p => p.team === playerTeam)
          .map(p => ({ id: p.id, name: p.name, isYou: p.id === player?.id })),
        opponents: duel.players
          .filter(p => p.team && p.team !== playerTeam)
          .map(p => ({ id: p.id, name: p.name })),
        teamRevealEndTime: duel.teamRevealEndTime,
        teamRevealCountdown: Math.max(0, Math.ceil((duel.teamRevealEndTime - Date.now()) / 1000)),
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
        myTeamKey: playerTeam,
        myTeamName: playerTeam === 'red' ? duel.teamRed.name : duel.teamBlue.name,
        opponentTeamName: playerTeam === 'red' ? duel.teamBlue.name : duel.teamRed.name,
        mySolvedCount: playerTeam === 'red' ? duel.teamRed.solvedCount : duel.teamBlue.solvedCount,
        opponentSolvedCount: playerTeam === 'red' ? duel.teamBlue.solvedCount : duel.teamRed.solvedCount,
        teamRedFinishTime: duel.teamRed.finishTime,
        teamBlueFinishTime: duel.teamBlue.finishTime,
        // SAFE recap of all 3 keywords once duel has finished
        keywordsRecap: duel.keywords.map(k => ({
          answer: k.answer,
          category: k.category,
        })),
        teamRedHistory: duel.teamRed.history,
        teamBlueHistory: duel.teamBlue.history,
      };
    }

    // In-progress: Team-specific view with ZERO LEAKS of opponent
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
      currentRound: myTeam.currentRound,
      totalRounds: DUEL_ROUNDS_PER_TEAM,
      internalRoomCode: myTeam.roomId,
      inReveal: myTeam.inReveal,
      waitingForOpponent: myTeam.waitingForOpponent,
      revealData: internalRoom?.lastRevealData || null,
    };
  }

  // Audience Big-screen view (/duel/:code)
  getAudienceState(code) {
    const duel = this.getDuel(code);
    if (!duel) {
      const archived = finishedDuelsArchive.find(d => d.code === (code || '').toUpperCase());
      if (archived) {
        return {
          code: archived.code,
          status: 'finished',
          teamRed: { name: archived.teamRedName, solvedCount: archived.teamRedSolved, inReveal: false },
          teamBlue: { name: archived.teamBlueName, solvedCount: archived.teamBlueSolved, inReveal: false },
          winner: archived.winner,
          winnerReason: archived.winnerReason,
          winningTeamName: archived.winningTeamName,
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
      expectedPlayers: duel.expectedPlayers,
      joinedCount: duel.players.length,
      teamRed: {
        name: duel.teamRed.name,
        players: duel.players.filter(p => p.team === 'red').map(p => p.name),
        solvedCount: duel.teamRed.solvedCount,
        inReveal: duel.teamRed.inReveal,
      },
      teamBlue: {
        name: duel.teamBlue.name,
        players: duel.players.filter(p => p.team === 'blue').map(p => p.name),
        solvedCount: duel.teamBlue.solvedCount,
        inReveal: duel.teamBlue.inReveal,
      },
      teamRevealEndTime: duel.teamRevealEndTime,
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
        });
      } else if (d.status === 'lobby' || d.status === 'countdown' || d.status === 'team_reveal') {
        waitingDuels.push({
          code: d.code,
          joinedCount: d.players.length,
          expectedPlayers: d.expectedPlayers,
          status: d.status,
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

  broadcastLobbyState(duel) {
    if (!this.io) return;
    if (duel.status === 'team_reveal' || duel.status === 'in_progress' || duel.status === 'finished') {
      duel.players.forEach(player => {
        if (player.socketId) this.io.to(player.socketId).emit('duel_lobby_state', this.getClientDuelState(duel.code, player.token));
      });
    } else {
      this.io.to(`duel_${duel.code}`).emit('duel_lobby_state', this.getClientDuelState(duel.code));
    }
    this.io.to(`duel_${duel.code}`).emit('duel_update', this.getAudienceState(duel.code));
    this.io.emit('arena_update', this.getArenaData());
  }

  broadcastTeamState(duel, teamKey) {
    if (!this.io) return;
    const team = teamKey === 'red' ? duel.teamRed : duel.teamBlue;
    if (team.roomId && typeof this.onTeamRoomUpdate === 'function') {
      this.onTeamRoomUpdate(team.roomId);
    }
  }

  broadcastDuelUpdate(duel) {
    if (!this.io) return;
    this.io.to(`duel_${duel.code}`).emit('duel_update', this.getAudienceState(duel.code));
    this.io.emit('arena_update', this.getArenaData());
  }
}

module.exports = new DuelManager();
