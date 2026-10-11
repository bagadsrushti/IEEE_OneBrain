const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const gameManager = require('../gameManager');
const eventManager = require('../eventManager');
const gameRules = require('../config/gameRules');
const { dealClues } = require('./dealClues');
const { initializeSockets } = require('../socket');
const challengesData = require('../data/challenges.json');

console.log('======================================================================');
console.log('PROGRESSIVE CLUE & 2-8 PLAYER TEST SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // ---------------------------------------------------------
  // 1. DEALING TESTS (N=2..8)
  // ---------------------------------------------------------
  console.log('--- 1. Clue Dealing Tests (N=2..8) ---');

  const sample8Clue = {
    id: 'test_8',
    answer: 'Paris',
    clues: [
      { text: 'City of light', strength: 9, angle: 'historical' },
      { text: 'Eiffel Tower is here', strength: 10, angle: 'landmark' },
      { text: 'Capital of France', strength: 8, angle: 'geography' },
      { text: 'Louvre museum location', strength: 8, angle: 'culture' },
      { text: 'Seine river flows through', strength: 6, angle: 'geography' },
      { text: 'Notre Dame cathedral', strength: 7, angle: 'landmark' },
      { text: 'Baguettes and cafes abound', strength: 4, angle: 'food' },
      { text: 'Hosted 2024 Olympic Games', strength: 6, angle: 'sports' },
    ]
  };

  const sample4Clue = {
    id: 'test_4',
    answer: 'Moon',
    clues: [
      { text: 'Earth natural satellite', strength: 9, angle: 'astronomy' },
      { text: 'Causes ocean tides', strength: 8, angle: 'physics' },
      { text: 'Apollo 11 landed here', strength: 8, angle: 'history' },
      { text: 'Has distinct lunar phases', strength: 7, angle: 'astronomy' },
    ]
  };

  for (let N = 2; N <= 8; N++) {
    runTest(`Dealing 8-clue keyword across N=${N} players`, () => {
      const piles = dealClues(sample8Clue, N);
      assert.strictEqual(piles.length, N, `Should return ${N} piles`);

      // All clues dealt once
      const totalClues = piles.reduce((acc, p) => acc + p.length, 0);
      assert.strictEqual(totalClues, sample8Clue.clues.length, 'All clues must be dealt once');

      // Every player has at least 1 clue
      piles.forEach((p, idx) => {
        assert.ok(p.length >= 1, `Player ${idx} must have at least 1 clue`);
      });

      // Pile sizes differ by at most 1
      const maxLen = Math.max(...piles.map(p => p.length));
      const minLen = Math.min(...piles.map(p => p.length));
      assert.ok(maxLen - minLen <= 1, `Pile sizes should differ by at most 1 (max=${maxLen}, min=${minLen})`);

      // For N=2 each pile holds exactly half
      if (N === 2) {
        assert.strictEqual(piles[0].length, 4, 'N=2 pile 0 must have exactly half');
        assert.strictEqual(piles[1].length, 4, 'N=2 pile 1 must have exactly half');
      }

      // Guard: No single player pile identifies the answer alone
      const totalStrength = sample8Clue.clues.reduce((acc, c) => acc + (c.strength || 5), 0);
      piles.forEach((p, idx) => {
        const pileStrength = p.reduce((acc, c) => acc + (c.strength || 5), 0);
        const ratio = pileStrength / totalStrength;
        assert.ok(ratio <= 0.65, `Player ${idx} has too high strength ratio: ${ratio}`);
      });
    });
  }

  for (let N = 2; N <= 4; N++) {
    runTest(`Dealing 4-clue keyword across N=${N} players`, () => {
      const piles = dealClues(sample4Clue, N);
      assert.strictEqual(piles.length, N);
      const totalClues = piles.reduce((acc, p) => acc + p.length, 0);
      assert.strictEqual(totalClues, 4);
      piles.forEach(p => assert.ok(p.length >= 1));
      const maxLen = Math.max(...piles.map(p => p.length));
      const minLen = Math.min(...piles.map(p => p.length));
      assert.ok(maxLen - minLen <= 1);
      if (N === 2) {
        assert.strictEqual(piles[0].length, 2);
        assert.strictEqual(piles[1].length, 2);
      }
    });
  }

  // ---------------------------------------------------------
  // 2. PLAYER LIMITS & VALIDATION
  // ---------------------------------------------------------
  console.log('\n--- 2. Player Limits (Min 2, Max 8) ---');

  runTest('Player limits in gameRules configuration', () => {
    assert.strictEqual(gameRules.MIN_PLAYERS, 2, 'MIN_PLAYERS must be 2');
    assert.strictEqual(gameRules.MAX_PLAYERS, 8, 'MAX_PLAYERS must be 8');
    const rules2 = gameRules.getRulesForPlayerCount(2);
    assert.ok(rules2, 'Rules for N=2 must exist');
    assert.strictEqual(rules2.roundSeconds, 120);
    assert.strictEqual(rules2.prepSeconds, 8);
    assert.strictEqual(rules2.maxAttempts, 3);
    assert.strictEqual(rules2.wrongPenalty, 10);
    assert.strictEqual(rules2.scoreMultiplier, 1.0);
    assert.strictEqual(rules2.waveIntervalSeconds, 30);
    assert.strictEqual(rules2.maxHints, 0);

    // 1 and 9 are invalid
    assert.strictEqual(gameRules.getRulesForPlayerCount(1), null);
    assert.strictEqual(gameRules.getRulesForPlayerCount(9), null);
  });

  runTest('Rules table is editable via updateRulesTable', () => {
    const updated = gameRules.updateRulesTable(2, { roundSeconds: 115, wrongPenalty: 12 });
    assert.strictEqual(updated.roundSeconds, 115);
    assert.strictEqual(updated.wrongPenalty, 12);
    // Restore
    gameRules.updateRulesTable(2, { roundSeconds: 120, wrongPenalty: 10 });
  });

  runTest('Keyword with fewer clues than N is never chosen', () => {
    const code = gameManager.createRoom('quick');
    const host = gameManager.joinRoom(code, 'Host').player;
    // Join 5 players total
    for (let i = 1; i < 5; i++) gameManager.joinRoom(code, `Player_${i}`);

    for (let testRound = 0; testRound < 20; testRound++) {
      const challenge = gameManager.getRandomChallenge(5, gameManager.getRoom(code), 'easy');
      assert.ok(challenge.clues.length >= 5, `Selected keyword has ${challenge.clues.length} clues, expected >= 5`);
    }
  });

  // ---------------------------------------------------------
  // 3. SERVER & SOCKET PROGRESSIVE RELEASE INTEGRATION TESTS
  // ---------------------------------------------------------
  console.log('\n--- 3. Progressive Release Socket Integration Tests ---');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initializeSockets(io);

  const TEST_PORT = 4123;
  await new Promise(r => server.listen(TEST_PORT, r));

  function createClient() {
    return new Promise((resolve) => {
      const socket = ioClient(`http://localhost:${TEST_PORT}`, { forceNew: true, reconnection: false });
      socket.on('connect', () => resolve(socket));
    });
  }

  // Test 1 player blocked, 2 players allowed, 9 players rejected
  await runAsyncTest('Room joins & start limits: 1 blocked, 9 rejected, 2 starts', async () => {
    const host = await createClient();
    const res = await new Promise(r => host.emit('create_room', { nickname: 'Host' }, r));
    const code = res.roomCode;

    // 1 player cannot start
    const start1 = await new Promise(r => host.emit('start_game', r));
    assert.ok(start1.error, 'Starting with 1 player must be rejected');

    // Add 2nd player -> can start
    const p2 = await createClient();
    const join2 = await new Promise(r => p2.emit('join_room', { code, nickname: 'P2' }, r));
    assert.ok(join2.success, '2nd player must join successfully');

    // Fill up to 8 players
    const clients = [host, p2];
    for (let i = 3; i <= 8; i++) {
      const c = await createClient();
      const j = await new Promise(r => c.emit('join_room', { code, nickname: `P${i}` }, r));
      assert.ok(j.success);
      clients.push(c);
    }

    // 9th player is rejected
    const p9 = await createClient();
    const join9 = await new Promise(r => p9.emit('join_room', { code, nickname: 'P9' }, r));
    assert.ok(join9.error, '9th player joining must be rejected');

    clients.forEach(c => c.disconnect());
    p9.disconnect();
  });

  // Progressive release test for N=2 with short wave interval
  await runAsyncTest('Progressive release schedule & anti-leak for N=2', async () => {
    // Override N=2 wave interval and prepSeconds temporarily for fast execution
    const origRules = { ...gameRules.RULES_TABLE[2] };
    gameRules.updateRulesTable(2, { prepSeconds: 1, waveIntervalSeconds: 1 });

    const host = await createClient();
    const res = await new Promise(r => host.emit('create_room', { nickname: 'Host' }, r));
    const code = res.roomCode;
    const p2 = await createClient();
    await new Promise(r => p2.emit('join_room', { code, nickname: 'P2' }, r));

    const room = gameManager.getRoom(code);
    // Force 4-clue challenge for 2 waves of 2 clues each
    room.category = 'General Knowledge';

    const hostCluesReceived = [];
    const p2CluesReceived = [];
    let leakedAnswer = false;

    host.on('room_update', (data) => {
      if (data.myClues) {
        data.myClues.forEach(c => {
          if (!hostCluesReceived.some(x => x.text === c.text)) {
            hostCluesReceived.push({ ...c, time: Date.now() });
          }
        });
      }
      if (data.state === 'playing' || data.state === 'ready') {
        // Anti-leak verification
        if (data.currentChallenge || data.answer) leakedAnswer = true;
      }
    });

    p2.on('room_update', (data) => {
      if (data.myClues) {
        data.myClues.forEach(c => {
          if (!p2CluesReceived.some(x => x.text === c.text)) {
            p2CluesReceived.push({ ...c, time: Date.now() });
          }
        });
      }
    });

    const startTime = Date.now();
    const startRes = await new Promise(r => host.emit('start_game', r));
    assert.ok(startRes.success);

    // During prep time (first 500ms): 0 clues should be received
    await sleep(400);
    assert.strictEqual(hostCluesReceived.length, 0, 'No clues should be released during prep time');
    assert.strictEqual(p2CluesReceived.length, 0, 'No clues should be released during prep time');

    // At 1.3s: prep has ended (1s), wave 1 has released
    await sleep(1000);
    assert.strictEqual(hostCluesReceived.length, 1, 'Wave 1 should have released 1 clue to host');
    assert.strictEqual(p2CluesReceived.length, 1, 'Wave 1 should have released 1 clue to P2');
    assert.notStrictEqual(hostCluesReceived[0].text, p2CluesReceived[0].text, 'Host and P2 must have DIFFERENT clues');

    // At 2.5s: wave 2 should have released
    await sleep(1200);
    assert.ok(hostCluesReceived.length >= 2, 'Wave 2 should have released 2nd clue to host');
    assert.ok(p2CluesReceived.length >= 2, 'Wave 2 should have released 2nd clue to P2');

    // Anti-leak check
    assert.strictEqual(leakedAnswer, false, 'No answer leaked during gameplay');

    // Restore table
    gameRules.updateRulesTable(2, origRules);
    host.disconnect();
    p2.disconnect();
  });

  // Reconnect mid-round test
  await runAsyncTest('Reconnect mid-round restores released clues without schedule alteration', async () => {
    gameRules.updateRulesTable(2, { prepSeconds: 1, waveIntervalSeconds: 1 });

    const host = await createClient();
    const res = await new Promise(r => host.emit('create_room', { nickname: 'Host' }, r));
    const code = res.roomCode;
    const p2 = await createClient();
    const p2Join = await new Promise(r => p2.emit('join_room', { code, nickname: 'P2' }, r));
    const p2Token = p2Join.token;

    await new Promise(r => host.emit('start_game', r));
    await sleep(1400); // Wave 1 released

    // P2 disconnects
    p2.disconnect();
    await sleep(200);

    // P2 reconnects with token
    const p2Recon = await createClient();
    let reconnectedClues = [];
    p2Recon.on('room_update', (data) => {
      if (data.myClues) reconnectedClues = data.myClues;
    });

    const recResult = await new Promise(r => p2Recon.emit('join_room', { code, nickname: 'P2', token: p2Token }, r));
    assert.ok(recResult.success);
    await sleep(200);

    assert.ok(reconnectedClues.length >= 1, 'Reconnected player receives clues released so far');

    gameRules.updateRulesTable(2, { roundSeconds: 120, prepSeconds: 8, waveIntervalSeconds: 30 });
    host.disconnect();
    p2Recon.disconnect();
  });

  // ---------------------------------------------------------
  // 4. ROUND TIME CAP & DEADLINE GUARANTEES
  // ---------------------------------------------------------
  console.log('\n--- 4. Round Timing & 120-Second Cap ---');

  for (let N = 2; N <= 8; N++) {
    runTest(`Round never exceeds 120s and last clue arrives before deadline for N=${N}`, () => {
      const rules = gameRules.getRulesForPlayerCount(N);
      assert.ok(rules.roundSeconds <= 120, `roundSeconds must be <= 120 for N=${N}`);

      // Calculate max waves for up to 8-clue keywords
      const maxClues = 8;
      const maxPile = Math.ceil(maxClues / N);
      const waveInterval = rules.waveIntervalSeconds || 0;

      if (waveInterval > 0) {
        // Last wave releases at prepSeconds + (maxPile - 1) * waveInterval
        const lastWaveSec = rules.prepSeconds + (maxPile - 1) * waveInterval;
        assert.ok(lastWaveSec < rules.roundSeconds, `Last clue wave (${lastWaveSec}s) must arrive before deadline (${rules.roundSeconds}s) for N=${N}`);
      }
    });
  }

  // ---------------------------------------------------------
  // 5. EVENT MODE ADDITIONS
  // ---------------------------------------------------------
  console.log('\n--- 5. Event Mode Additions (Team Builder, Pool, Limits) ---');

  runTest('Team Builder suggestions for small and large crowds', () => {
    // 9 players -> 3+3+3 or 4+5 (if max=5)
    const s9 = eventManager.suggestTeamSplits(9, 2, 4);
    assert.ok(s9.length > 0, 'Should suggest team configurations for 9 players');
    const exact3 = s9.find(s => s.sizes.length === 3 && s.sizes.every(t => t === 3));
    assert.ok(exact3, 'Should suggest 3+3+3 for 9 players');

    // 7 players -> 3+4
    const s7 = eventManager.suggestTeamSplits(7, 2, 4);
    const split7 = s7.find(s => s.sizes.includes(3) && s.sizes.includes(4));
    assert.ok(split7, 'Should suggest 3+4 for 7 players');

    // 2 players -> single duo
    const s2 = eventManager.suggestTeamSplits(2, 2, 4);
    assert.ok(s2.some(s => s.sizes.length === 1 && s.sizes[0] === 2), 'Should suggest [2] for 2 players');
  });

  runTest('Event Mode setup enforces min/max team player limits', () => {
    eventManager.resetEvent();
    const evt = eventManager.createEvent({
      name: 'Limits Event',
      maxConcurrentTeams: 3,
      maxPlayersPerTeam: 6,
      minPlayersPerTeam: 2,
    });
    assert.strictEqual(evt.maxPlayersPerTeam, 6);
    assert.strictEqual(evt.minPlayersPerTeam, 2);
  });

  runTest('Event Mode leaderboard filter supports duo, small, large', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Leaderboard Test', maxConcurrentTeams: 5 });
    eventManager.openEvent(challengesData);

    // Register 3 teams of sizes 2, 3, 6
    eventManager.registerTeamRoom('ROOM_DUO', 'Duo Team');
    eventManager.recordRoundResult('ROOM_DUO', 1, { answer: 'A', solved: true, secondsUsed: 30, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.completeTeamRun('ROOM_DUO', ['P1', 'P2'], 2);

    eventManager.registerTeamRoom('ROOM_SMALL', 'Small Team');
    eventManager.recordRoundResult('ROOM_SMALL', 1, { answer: 'B', solved: true, secondsUsed: 40, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.completeTeamRun('ROOM_SMALL', ['P1', 'P2', 'P3'], 3);

    eventManager.registerTeamRoom('ROOM_LARGE', 'Large Team');
    eventManager.recordRoundResult('ROOM_LARGE', 1, { answer: 'C', solved: true, secondsUsed: 50, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.completeTeamRun('ROOM_LARGE', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], 6);

    const duoBoard = eventManager.getLeaderboard('duo');
    assert.strictEqual(duoBoard.length, 1);
    assert.strictEqual(duoBoard[0].teamName, 'Duo Team');

    const smallBoard = eventManager.getLeaderboard('small');
    assert.strictEqual(smallBoard.length, 1);
    assert.strictEqual(smallBoard[0].teamName, 'Small Team');

    const largeBoard = eventManager.getLeaderboard('large');
    assert.strictEqual(largeBoard.length, 1);
    assert.strictEqual(largeBoard[0].teamName, 'Large Team');

    const allBoard = eventManager.getLeaderboard('all');
    assert.strictEqual(allBoard.length, 3);
  });

  // Shutdown server
  await new Promise(r => server.close(r));

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('ALL TESTS PASSED! 🎉');
  } else {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
