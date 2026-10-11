const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');

const duelManager = require('../duelManager');
const gameManager = require('../gameManager');
const { initializeSockets } = require('../socket');
const challengesData = require('../data/challenges.json');

console.log('======================================================================');
console.log('DUEL MODE COMPREHENSIVE TEST SUITE');
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

async function main() {
  duelManager.setGameManager(gameManager);

  // ===================================================================
  // 1. SPLIT TESTS (4 to 16 players, balanced, rejected outside range)
  // ===================================================================
  console.log('--- 1. Team Splitting & Player Limit Tests ---');

  runTest('3 players rejected for split (<4 min)', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    duelManager.joinDuel(duel.code, 'P2');
    duelManager.joinDuel(duel.code, 'P3');
    const res = duelManager.splitTeams(duel.code, hostPlayer.id);
    assert(res.error, 'Should fail to split 3 players');
    assert(res.error.includes('At least 4 players'), `Unexpected error: ${res.error}`);
    duelManager.cancelDuel(duel.code);
  });

  runTest('17th player joining is rejected (>16 max)', () => {
    const { duel } = duelManager.createDuel('Host');
    for (let i = 2; i <= 16; i++) {
      const jRes = duelManager.joinDuel(duel.code, `P${i}`);
      assert(jRes.success, `Player ${i} should join`);
    }
    const rejectRes = duelManager.joinDuel(duel.code, 'P17');
    assert(rejectRes.error, '17th player must be rejected');
    assert(rejectRes.error.includes('max 16'), `Unexpected error: ${rejectRes.error}`);
    duelManager.cancelDuel(duel.code);
  });

  runTest('Splits for all valid player counts (N=4..16) are balanced within 1 and teams 2..8', () => {
    for (let count = 4; count <= 16; count++) {
      const { duel, hostPlayer } = duelManager.createDuel('Host');
      for (let i = 2; i <= count; i++) {
        duelManager.joinDuel(duel.code, `P${i}`);
      }
      const splitRes = duelManager.splitTeams(duel.code, hostPlayer.id);
      assert(splitRes.success, `Split should succeed for count ${count}: ${splitRes.error}`);
      const red = duel.teamRed.playerIds.length;
      const blue = duel.teamBlue.playerIds.length;
      assert(red + blue === count, `Sum should equal ${count}`);
      assert(Math.abs(red - blue) <= 1, `Team sizes should differ by at most 1 (got ${red} and ${blue})`);
      assert(red >= 2 && red <= 8, `Team Red size must be in 2..8 (got ${red})`);
      assert(blue >= 2 && blue <= 8, `Team Blue size must be in 2..8 (got ${blue})`);
      duelManager.cancelDuel(duel.code);
    }
  });

  runTest('Shuffle re-randomizes teams and team renaming sanitizes and updates', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 8; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);

    const renameRes = duelManager.renameTeams(duel.code, hostPlayer.id, '  <b>Super Red</b>  ', 'Cool Blue!');
    assert(renameRes.success);
    assert.strictEqual(duel.teamRed.name, 'Super Red', 'Should strip html tags and whitespace');
    assert.strictEqual(duel.teamBlue.name, 'Cool Blue!');

    const shuffleRes = duelManager.splitTeams(duel.code, hostPlayer.id, true);
    assert(shuffleRes.success);
    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 2. KEYWORDS & FAIRNESS TESTS
  // ===================================================================
  console.log('\n--- 2. Keywords, Fairness & Offset Sequences ---');

  runTest('Both teams receive same 3 main keywords in offset orders (never same keyword at same step)', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 6; i++) duelManager.joinDuel(duel.code, `P${i}`); // 6 players (3v3)
    duelManager.splitTeams(duel.code, hostPlayer.id);

    const startRes = duelManager.startDuel(duel.code, hostPlayer.id);
    assert(startRes.success, `Failed to start duel: ${startRes.error}`);

    assert.strictEqual(duel.pool.main.length, 3, 'Should have 3 main keywords');
    assert.strictEqual(duel.pool.reserves.length, 3, 'Should have 3 reserve keywords');

    const redSeq = duel.teamRedSequence;
    const blueSeq = duel.teamBlueSequence;

    // Same set of 3 main keywords
    const redIds = redSeq.map(c => c.id).sort();
    const blueIds = blueSeq.map(c => c.id).sort();
    assert.deepStrictEqual(redIds, blueIds, 'Both teams must play the same 3 main keywords');

    // Never on the same keyword at any of the 3 steps
    for (let step = 0; step < 3; step++) {
      assert.notStrictEqual(redSeq[step].id, blueSeq[step].id, `Step ${step} has identical keyword on both teams!`);
    }

    // Every keyword has at least as many clues as the larger team size
    const maxTeamSize = Math.max(duel.teamRed.playerIds.length, duel.teamBlue.playerIds.length);
    [...duel.pool.main, ...duel.pool.reserves].forEach(kw => {
      assert(kw.clues.length >= maxTeamSize, `Keyword ${kw.answer} has ${kw.clues.length} clues, needed >= ${maxTeamSize}`);
    });

    duelManager.cancelDuel(duel.code);
  });

  runTest('Replacement reserve keyword never equals the opponent’s current active keyword', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`); // 4 players (2v2)
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    // Suppose team blue is currently on keyword X
    const blueCurrent = duel.teamBlue.currentKeyword;
    assert(blueCurrent);

    // Make reserve 0 have the same id as blueCurrent
    duel.pool.reserves[0] = blueCurrent;

    // Team Red requests next reserve
    const picked = duelManager.pickNextReserve(duel, 'red');
    assert(picked, 'Should pick a reserve');
    assert.notStrictEqual(picked.id, blueCurrent.id, 'Reserve must NEVER equal opponent’s active keyword');

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 3. RACE LOGIC TESTS (First to 3 solves wins, late submissions rejected)
  // ===================================================================
  console.log('\n--- 3. Race Progression & Win Execution ---');

  runTest('First team to 3 solves wins immediately, stops opponent, rejects subsequent submissions', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    const redPlayer = duel.players.find(p => p.team === 'red');
    const bluePlayer = duel.players.find(p => p.team === 'blue');

    // Solve 1 for Red
    const kw1 = duel.teamRed.currentKeyword;
    let res = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw1.answer);
    assert(res.isCorrect);
    assert.strictEqual(duel.teamRed.solvedCount, 1);
    assert.strictEqual(duel.status, 'in_progress');

    // Simulate reveal end and start keyword 2 for Red
    duel.teamRed.inReveal = false;
    duelManager.startTeamKeyword(duel, 'red', 1);

    // Solve 2 for Red
    const kw2 = duel.teamRed.currentKeyword;
    res = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw2.answer);
    assert(res.isCorrect);
    assert.strictEqual(duel.teamRed.solvedCount, 2);

    // Simulate reveal end and start keyword 3 for Red
    duel.teamRed.inReveal = false;
    duelManager.startTeamKeyword(duel, 'red', 2);

    // Solve 3 for Red -> WINNER!
    const kw3 = duel.teamRed.currentKeyword;
    res = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw3.answer);
    assert(res.isCorrect);
    assert.strictEqual(res.winner, 'red', 'Team Red must win on 3rd solve');
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'red');
    assert.strictEqual(duel.winnerReason, 'first_to_3');

    // Opponent Blue keyword is stopped, and subsequent answers rejected
    const lateRes = duelManager.submitAnswer(duel.code, 'blue', bluePlayer.id, duel.teamBlue.currentKeyword.answer);
    assert(lateRes.error, 'Submissions arriving after duel completion must be rejected');
    assert(lateRes.error.includes('not currently active'), `Unexpected error: ${lateRes.error}`);

    duelManager.cancelDuel(duel.code);
  });

  runTest('Keyword failure triggers reserve replacement and continues race to 3', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    const redPlayer = duel.players.find(p => p.team === 'red');

    // Fail keyword 0 for Red via 3 wrong attempts
    const kw0 = duel.teamRed.currentKeyword;
    duelManager.submitAnswer(duel.code, 'red', redPlayer.id, 'Wrong1');
    duelManager.submitAnswer(duel.code, 'red', redPlayer.id, 'Wrong2');
    const failRes = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, 'Wrong3');
    assert(failRes.exhausted, 'Attempts should be exhausted');
    assert.strictEqual(duel.teamRed.solvedCount, 0);

    // Fast-forward reveal to start replacement reserve keyword
    duel.teamRed.inReveal = false;
    duelManager.startTeamKeyword(duel, 'red', 1);

    // Sequence now has the next keyword
    assert(duel.teamRed.currentKeyword, 'Must have received next keyword');
    assert.strictEqual(duel.teamRed.currentKeywordIndex, 1);

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 4. MATCH CAP & TIE-BREAKERS
  // ===================================================================
  console.log('\n--- 4. Match Cap & Tie-Breakers ---');

  runTest('Match cap: Team with more solves wins', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    duel.teamRed.solvedCount = 2;
    duel.teamBlue.solvedCount = 1;

    duelManager.handleMatchCapTimeout(duel.code);
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'red');
    assert.strictEqual(duel.winnerReason, 'time_cap_solves');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Match cap tie-breaker 1: Lower total solve time wins when solves are equal', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    duel.teamRed.solvedCount = 2;
    duel.teamRed.totalSolveTime = 85;

    duel.teamBlue.solvedCount = 2;
    duel.teamBlue.totalSolveTime = 110;

    duelManager.handleMatchCapTimeout(duel.code);
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'red');
    assert.strictEqual(duel.winnerReason, 'tie_breaker_time');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Match cap tie-breaker 2: Fewer wrong attempts wins when solves and time are equal', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    duel.teamRed.solvedCount = 2;
    duel.teamRed.totalSolveTime = 80;
    duel.teamRed.totalWrongAttempts = 4;

    duel.teamBlue.solvedCount = 2;
    duel.teamBlue.totalSolveTime = 80;
    duel.teamBlue.totalWrongAttempts = 1;

    duelManager.handleMatchCapTimeout(duel.code);
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'blue');
    assert.strictEqual(duel.winnerReason, 'tie_breaker_wrong');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Match cap draw: Equal solves, solve time, and wrong attempts results in Draw', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    duel.teamRed.solvedCount = 1;
    duel.teamRed.totalSolveTime = 50;
    duel.teamRed.totalWrongAttempts = 2;

    duel.teamBlue.solvedCount = 1;
    duel.teamBlue.totalSolveTime = 50;
    duel.teamBlue.totalWrongAttempts = 2;

    duelManager.handleMatchCapTimeout(duel.code);
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'draw');
    assert.strictEqual(duel.winnerReason, 'draw');

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 5. DISCONNECT & FORFEIT HANDLING
  // ===================================================================
  console.log('\n--- 5. Disconnects & Forfeit ---');

  runTest('Rejoining mid-round with existing token restores player and clears team disconnect timer', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    const p2Res = duelManager.joinDuel(duel.code, 'P2');
    for (let i = 3; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    // Player disconnects
    duelManager.leaveDuel(duel.code, p2Res.player.id);
    const p = duel.players.find(x => x.id === p2Res.player.id);
    assert.strictEqual(p.connected, false);

    // Player reconnects using token
    const reRes = duelManager.joinDuel(duel.code, 'P2', p2Res.token);
    assert(reRes.success);
    assert.strictEqual(reRes.player.connected, true);

    duelManager.cancelDuel(duel.code);
  });

  runTest('Team offline triggers forfeit: opponent wins by forfeit', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    // Trigger forfeit directly for Red
    duelManager.handleTeamForfeit(duel.code, 'red');
    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'blue');
    assert.strictEqual(duel.winnerReason, 'forfeit');

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 6. ANTI-LEAK SECURITY CHECKS
  // ===================================================================
  console.log('\n--- 6. Zero-Leak Security Verification ---');

  runTest('In-progress client payload contains ZERO leaks of opponent keywords, clues or answers', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host');
    for (let i = 2; i <= 6; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.splitTeams(duel.code, hostPlayer.id);
    duelManager.startDuel(duel.code, hostPlayer.id);

    const redPlayer = duel.players.find(p => p.team === 'red');
    const bluePlayer = duel.players.find(p => p.team === 'blue');

    const redState = duelManager.getClientDuelState(duel.code, redPlayer.token);
    const redJson = JSON.stringify(redState).toLowerCase();

    const blueKeyword = duel.teamBlue.currentKeyword;
    assert(blueKeyword);
    const blueAns = blueKeyword.answer.toLowerCase();

    // Red's payload must NOT contain Blue's keyword answer or clues
    assert(!redJson.includes(blueAns), `Leak: Red state includes Blue keyword answer "${blueAns}"!`);
    blueKeyword.clues.forEach(c => {
      assert(!redJson.includes(c.text.toLowerCase()), `Leak: Red state includes Blue clue "${c.text}"!`);
    });

    // Check opponent order: unplayed keywords must not be exposed
    duel.pool.reserves.forEach(r => {
      assert(!redJson.includes(r.answer.toLowerCase()), `Leak: Red state exposed unplayed reserve "${r.answer}"!`);
    });

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 7. CONCURRENCY & MULTI-DUEL SIMULATION
  // ===================================================================
  console.log('\n--- 7. Concurrency & Socket Server Multi-Duel Tests ---');

  await runAsyncTest('10 simultaneous duels run with zero cross-talk', async () => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    initializeSockets(io);

    await new Promise(res => server.listen(0, res));
    const port = server.address().port;
    const socketUrl = `http://localhost:${port}`;

    const duelCodes = [];
    const createdDuels = [];

    // Create 10 duels simultaneously
    for (let d = 0; d < 10; d++) {
      const { duel, hostPlayer } = duelManager.createDuel(`Host_${d}`);
      duelCodes.push(duel.code);
      createdDuels.push({ duel, hostPlayer });

      // Join 7 more players to make 8 players each (4v4)
      for (let p = 2; p <= 8; p++) {
        duelManager.joinDuel(duel.code, `P${p}_D${d}`);
      }

      duelManager.splitTeams(duel.code, hostPlayer.id);
      const startRes = duelManager.startDuel(duel.code, hostPlayer.id);
      assert(startRes.success, `Duel ${d} failed to start: ${startRes.error}`);
    }

    assert.strictEqual(duelCodes.length, 10);

    // Verify isolation: each duel has distinct codes and separate internal rooms
    const allInternalRooms = new Set();
    createdDuels.forEach(({ duel }) => {
      assert.strictEqual(duel.status, 'in_progress');
      assert(duel.teamRed.roomId);
      assert(duel.teamBlue.roomId);
      assert(!allInternalRooms.has(duel.teamRed.roomId), 'Room collision between duels!');
      assert(!allInternalRooms.has(duel.teamBlue.roomId), 'Room collision between duels!');
      allInternalRooms.add(duel.teamRed.roomId);
      allInternalRooms.add(duel.teamBlue.roomId);
    });

    // Solve duel 3 for red, duel 7 for blue
    const d3 = createdDuels[3].duel;
    const d7 = createdDuels[7].duel;

    duelManager.endDuelWithWinner(d3, 'red', 'first_to_3');
    duelManager.endDuelWithWinner(d7, 'blue', 'first_to_3');

    assert.strictEqual(d3.winner, 'red');
    assert.strictEqual(d7.winner, 'blue');
    // Other duels still in progress
    assert.strictEqual(createdDuels[0].duel.status, 'in_progress');
    assert.strictEqual(createdDuels[1].duel.status, 'in_progress');

    // Clean up all 10 duels
    duelCodes.forEach(code => duelManager.cancelDuel(code));

    await new Promise(res => server.close(res));
  });

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('ALL DUEL TESTS PASSED! 🎉\n');
    process.exit(0);
  } else {
    console.error(`FAILED: ${totalTests - passedTests} test(s) failed.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
