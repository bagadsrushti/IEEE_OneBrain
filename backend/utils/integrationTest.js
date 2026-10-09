const io = require('socket.io-client');
const http = require('http');
const express = require('express');
const gameManager = require('../gameManager');
const gameRules = require('../config/gameRules');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const socketServer = new Server(server, { cors: { origin: '*' } });
const { initializeSockets } = require('../socket');
initializeSockets(socketServer);

const PORT = 4000;
let exitCode = 0;
const pass = (msg) => console.log(`✅ PASS: ${msg}`);
const fail = (msg) => { console.error(`❌ FAIL: ${msg}`); exitCode = 1; };

function createClient() {
  return new Promise((resolve) => {
    const socket = io(`http://localhost:${PORT}`);
    socket.on('connect', () => {
      resolve(socket);
    });
  });
}

function joinRoom(socket, roomCode, nickname, token = null) {
  return new Promise((resolve) => {
    socket.emit('join_room', { code: roomCode, nickname, token }, (res) => {
      resolve(res);
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("Starting Integration Tests on port", PORT);
  await new Promise(r => server.listen(PORT, r));

  try {
    const host = await createClient();
    let res = await new Promise(r => host.emit('create_room', { nickname: 'Host' }, r));
    const roomCode = res.roomCode;
    // Wait, the emit create_room returns { success, token, roomCode, playerId }.
    const hostToken = res.token;
    
    // a. Reject 9th player, block 2 players
    let clients = [host];
    let tokens = [hostToken];
    for(let i=1; i<8; i++) {
      const c = await createClient();
      const j = await joinRoom(c, roomCode, `P${i}`);
      clients.push(c);
      tokens.push(j.token);
    }
    const ninth = await createClient();
    const ninthRes = await joinRoom(ninth, roomCode, 'P9');
    if (ninthRes.error) pass("9th player joining is rejected.");
    else fail("9th player was able to join.");
    
    // Test 2 players starting
    const host2 = await createClient();
    const room2 = await new Promise(r => host2.emit('create_room', { nickname: 'H2' }, r));
    const code2 = room2.roomCode;
    const c2 = await createClient();
    await joinRoom(c2, code2, 'P1');
    const start2 = await new Promise(r => host2.emit('start_game', r));
    if (start2.error) pass("Starting with 2 players is blocked.");
    else fail("Started with 2 players.");
    c2.disconnect();

    // LEAK CHECK Setup
    let leakDetected = false;
    let crossClueDetected = false;
    const receivedClues = new Map(); // socket.id -> clue
    
    const checkLeak = (data, socketId) => {
      if (data.state === 'playing' || data.state === 'ready') {
        if (data.myClue) {
          receivedClues.set(socketId, data.myClue);
          const challenge = gameManager.getRoom(roomCode).currentChallenge;
          const answer = challenge.answer.toLowerCase();
          const aliases = challenge.aliases.map(a => a.toLowerCase());
          const textLower = data.myClue.toLowerCase();
          
          if (textLower.includes(answer)) leakDetected = true;
          aliases.forEach(a => { if (textLower.includes(a)) leakDetected = true; });
        }
      }
    };

    clients.forEach(c => {
      c.on('room_update', (data) => checkLeak(data, c.id));
    });

    const startRes = await new Promise(r => host.emit('start_game', r));
    if (startRes.error) fail("Failed to start with 8 players: " + startRes.error);
    else pass("Started with 8 players.");
    
    await sleep(300); // let updates flow

    // Cross clue check
    const allClues = Array.from(receivedClues.values());
    const uniqueClues = new Set(allClues);
    if (uniqueClues.size !== clients.length) crossClueDetected = true;

    if (!leakDetected && !crossClueDetected) pass("LEAK CHECK: No answer/alias leakage and all distinct clues.");
    else fail("LEAK CHECK failed.");

    // b. Disconnect mid-round
    const roomState = gameManager.getRoom(roomCode);
    const initialAttempts = roomState.roundRules.maxAttempts;
    const p1Clue = receivedClues.get(clients[1].id);
    
    clients[1].disconnect();
    await sleep(200);
    
    if (gameManager.getRoom(roomCode).roundRules.maxAttempts === initialAttempts) {
      pass("Disconnect mid-round does not change round rules.");
    } else fail("Disconnect mid-round changed rules.");
    
    const p1Reconnect = await createClient();
    let reconnectedClue = null;
    p1Reconnect.on('room_update', data => {
      if (data.myClue) reconnectedClue = data.myClue;
    });
    const recRes = await joinRoom(p1Reconnect, roomCode, 'P1_Rec', tokens[1]);
    await sleep(200);
    
    if (recRes.success && reconnectedClue === p1Clue) pass("Reconnect with same token gives same clue.");
    else fail("Reconnect failed or gave different clue.");

    // f. Hints
    gameManager.getRoom(roomCode).state = 'playing'; // force state
    const maxHints = gameManager.getRoom(roomCode).roundRules.maxHints;
    let hintErrors = 0;
    const initialUnassignedCount = gameManager.getRoom(roomCode).unassignedClues.length;
    for(let i=0; i<maxHints + 1; i++) {
      const hRes = await new Promise(r => p1Reconnect.emit('use_hint', r));
      if (hRes && hRes.error) hintErrors++;
    }
    if (hintErrors === 1) pass("Using more than maxHints is rejected.");
    else fail(`Expected 1 hint error, got ${hintErrors}.`);

    // d. Submissions after attempts exhausted
    const maxAtt = gameManager.getRoom(roomCode).roundRules.maxAttempts;
    let ansErrors = 0;
    for(let i=0; i<maxAtt; i++) {
      await sleep(1050);
      const aRes = await new Promise(r => host.emit('submit_answer', { guess: 'wrong_guess' }, r));
      if (aRes && aRes.error) ansErrors++;
    }
    // After maxAtt, state should be finished
    if (gameManager.getRoom(roomCode).state === 'finished') pass("Game ends after max wrong attempts.");
    else fail("Game did not end after max wrong attempts.");
    
    // Submissions after endTime
    gameManager.getRoom(roomCode).state = 'playing';
    gameManager.getRoom(roomCode).roundEndTime = Date.now() - 1000;
    await sleep(1050);
    const lateAns = await new Promise(r => host.emit('submit_answer', { guess: 'wrong' }, r));
    if (gameManager.getRoom(roomCode).state === 'finished' && gameManager.getRoom(roomCode).lastRoundReason === 'Time is up!') {
      pass("Submission after endTime forces endRound timeout.");
    } else fail("Late submission did not trigger timeout.");

    // c. Auto-ends at deadline & total game time <= 120s
    let allTimesValid = true;
    for(let N=3; N<=8; N++) {
      const rulesOn = gameRules.getRulesForPlayerCount(N);
      gameRules.setFlat120sMode(true);
      const rulesFlat = gameRules.getRulesForPlayerCount(N);
      gameRules.setFlat120sMode(false);
      
      if (rulesOn.roundSeconds > 120 || rulesFlat.roundSeconds !== 120) allTimesValid = false;
    }
    if (allTimesValid) pass("Total game time never exceeds 120s for N=3..8.");
    else fail("Game time calculation exceeded 120s.");

    // g. Scoring logic: correct answer, 1 hint, 1 wrong, N=5
    gameManager.getRoom(roomCode).players = Array.from({length: 5}, (_, i) => ({ id: `id${i}`, connected: true }));
    gameManager.getRoom(roomCode).teamSize = 5;
    gameManager.getRoom(roomCode).roundRules = gameRules.getRulesForPlayerCount(5);
    gameManager.getRoom(roomCode).hintsUsed = 1;
    gameManager.getRoom(roomCode).wrongAttempts = 1;
    gameManager.getRoom(roomCode).roundEndTime = Date.now() + 10000; // 10 seconds left
    
    const expectedBase = 100;
    // timeBonus = floor(10 / roundSeconds * 40) + 10 
    const roundSecs = gameManager.getRoom(roomCode).roundRules.roundSeconds;
    const timeBonus = Math.floor((10 / roundSecs) * 40) + 10;
    const hintPen = 1 * gameManager.getRoom(roomCode).roundRules.hintPenalty; 
    const wrongPen = 1 * gameManager.getRoom(roomCode).roundRules.wrongPenalty; 
    const raw = expectedBase + timeBonus - hintPen - wrongPen;
    const multiplier = gameManager.getRoom(roomCode).roundRules.scoreMultiplier;
    const expectedScore = Math.max(0, Math.round(raw * multiplier));
    
    gameManager.endRound(roomCode, true, 'Test');
    const actualScore = gameManager.getRoom(roomCode).lastRoundScoreBreakdown.finalScore;
    
    if (actualScore === expectedScore) pass("Scoring formula logic verified exactly for N=5.");
    else fail(`Scoring logic mismatch. Expected ${expectedScore}, got ${actualScore}`);

  } catch (err) {
    console.error(err);
    exitCode = 1;
  }
  
  process.exit(exitCode);
}

runTests();
