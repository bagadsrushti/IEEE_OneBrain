const fs = require('fs');
const path = require('path');
const { getRulesForPlayerCount, isFlat120sMode, MIN_PLAYERS, MAX_PLAYERS } = require('./config/gameRules');
const { CATEGORIES } = require('./config/categories');
const { isCorrectGuess, normalize } = require('./utils/answerMatcher');
const { MAX_GUESS_LENGTH } = require('./config/matching');

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
  const pool = {};
  challengesData.forEach(c => {
    if (!usageTracker.isSubfieldDisabled(c.category, c.subfield) && !usageTracker.isKeywordDisabled(c.id)) {
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
    if (!selectedDomain) return challengesData[0]; // absolute fallback
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
        
        // d. Choose randomly among keywords NOT yet used in this event (we'll define "event" as having count = 0 or we can track event explicitly. The prompt says "NOT yet used in this event").
        // Let's interpret "not yet used in this event" as getKeywordCount == 0, since we reset rotation on event start or admin action.
        
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

  // Absolute fallback
  if (!selectedChallenge) {
    selectedChallenge = challengesData[Math.floor(Math.random() * challengesData.length)];
    if (!room.usedKeywords) room.usedKeywords = new Set();
    room.usedKeywords.add(selectedChallenge.id);
    usageTracker.recordUsage(selectedChallenge.category, selectedChallenge.subfield, selectedChallenge.id, playerTokens);
  }
  return selectedChallenge;
}

class GameManager {
  createRoom() {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

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
    };
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
    if (room && room.timeout) clearTimeout(room.timeout);
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
          this.refreshRoomTimeout(code);
          return { room, player: p, token };
        }
      }
    }

    const activePlayers = room.players.filter(p => p.connected).length;
    if (activePlayers >= MAX_PLAYERS) return { error: `Room is full (max ${MAX_PLAYERS} players)` };
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

  leaveRoom(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return null;

    const p = room.players.find(pl => pl.id === playerId);
    if (p) p.connected = false;

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

  startGame(code, playerId, onRoundEnd) {
    const room = this.getRoom(code);
    if (!room || room.host !== playerId || room.state !== 'lobby') return { error: 'Cannot start game' };
    
    const activePlayers = room.players.filter(p => p.connected);
    const N = activePlayers.length;
    if (N < MIN_PLAYERS || N > MAX_PLAYERS) return { error: `Need ${MIN_PLAYERS}-${MAX_PLAYERS} players` };

    const rules = getRulesForPlayerCount(N);
    if (!rules) return { error: 'Invalid player count for rules' };

    room.roundRules = rules; // Lock rules for the round
    room.teamSize = N;

    const challenge = getRandomChallenge(N, room, rules.difficultyTier);

    room.state = 'ready';
    room.currentChallenge = challenge;
    room.hintsUsed = 0;
    room.wrongAttempts = 0;
    room.sharedHint = null;
    
    // Select N clues with N DISTINCT angles
    let availableClues = (challenge.clues || []).map(c => typeof c === 'string' ? { angle: 'General', text: c } : c);
    const selectedClues = [];
    const usedAngles = new Set();

    // Try to pick distinct angles
    for (let i = 0; i < N; i++) {
      let candidateIdx = availableClues.findIndex(c => !usedAngles.has(c.angle));
      if (candidateIdx === -1 && availableClues.length > 0) {
        candidateIdx = 0; 
      }
      let clue = candidateIdx !== -1 ? availableClues.splice(candidateIdx, 1)[0] : null;
      if (!clue && selectedClues.length > 0) {
        clue = selectedClues[i % selectedClues.length];
      }
      if (clue) {
        selectedClues.push(clue);
        if (clue.angle) usedAngles.add(clue.angle);
      }
    }

    // Shuffle and assign
    selectedClues.sort(() => 0.5 - Math.random());
    for (let i = 0; i < N; i++) {
      activePlayers[i].clue = selectedClues[i]?.text || 'No clue available';
    }
    
    // Remaining clues for hints (also try to use distinct angles if possible)
    room.unassignedClues = availableClues.filter(c => !usedAngles.has(c.angle)).map(c => c.text);
    if (room.unassignedClues.length === 0) {
      room.unassignedClues = availableClues.map(c => c.text); // fallback
    }
    if (room.unassignedClues.length === 0 && selectedClues.length > 0) {
      room.unassignedClues = [selectedClues[0].text];
    }

    const now = Date.now();
    const totalMs = rules.roundSeconds * 1000;
    const prepMs = rules.prepSeconds * 1000;

    room.readyEndTime = now + prepMs;
    room.roundEndTime = now + totalMs; // Total time since start
    
    if (room.timer) clearTimeout(room.timer);
    
    room.timer = setTimeout(() => {
      room.state = 'playing';
      onRoundEnd(room, 'started');
      
      const playMs = totalMs - prepMs;
      room.timer = setTimeout(() => {
        if (room.state === 'playing') {
          this.endRound(code, false, 'Time is up!');
          onRoundEnd(room, 'timeout');
        }
      }, playMs);
    }, prepMs);

    this.refreshRoomTimeout(code);
    return { room };
  }

  useHint(code) {
    const room = this.getRoom(code);
    if (!room || room.state !== 'playing') return null;
    
    if (room.hintsUsed >= room.roundRules.maxHints || room.unassignedClues.length === 0) {
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

  endRound(code, success, reason) {
    const room = this.getRoom(code);
    if (!room) return null;
    
    if (room.timer) clearTimeout(room.timer);
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
}

module.exports = new GameManager();
