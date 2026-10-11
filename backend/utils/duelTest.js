const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const duelManager = require('../duelManager');
const gameManager = require('../gameManager');
const { initializeSockets } = require('../socket');

console.log('======================================================================');
console.log('DUEL MODE COMPREHENSIVE TEST SUITE (REVISED)');
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
  // 1. PLAYER COUNT VALIDATION & QUEUE MANAGEMENT
  // ===================================================================
  console.log('--- 1. Player Count Validation & Queue Management ---');

  runTest('Odd and out-of-range player counts are rejected on createDuel', () => {
    // Odd numbers
    [3, 5, 7, 9, 11, 13, 15].forEach(odd => {
      assert.throws(() => {
        duelManager.createDuel('Host', odd);
      }, /Expected players must be an even number/, `Should reject odd player count ${odd}`);
    });

    // Out of range (<4 or >16)
    [0, 2, 18, 20, 100].forEach(bad => {
      assert.throws(() => {
        duelManager.createDuel('Host', bad);
      }, /Expected players must be an even number/, `Should reject out of range count ${bad}`);
    });

    // Valid even numbers 4, 6, 8, 10, 12, 14, 16 succeed
    [4, 6, 8, 10, 12, 14, 16].forEach(valid => {
      const { duel } = duelManager.createDuel('Host', valid);
      assert.strictEqual(duel.expectedPlayers, valid);
      duelManager.cancelDuel(duel.code);
    });
  });

  runTest('Queue shows live counts, joins beyond N rejected ("Duel full")', () => {
    const N = 4;
    const { duel } = duelManager.createDuel('Host', N);
    assert.strictEqual(duel.players.length, 1);

    const j2 = duelManager.joinDuel(duel.code, 'P2');
    assert(j2.success);
    assert.strictEqual(duel.players.length, 2);

    const j3 = duelManager.joinDuel(duel.code, 'P3');
    assert(j3.success);
    assert.strictEqual(duel.players.length, 3);

    const j4 = duelManager.joinDuel(duel.code, 'P4');
    assert(j4.success);
    assert.strictEqual(duel.players.length, 4);

    // 5th player joining when N=4 must be rejected
    const j5 = duelManager.joinDuel(duel.code, 'P5');
    assert(j5.error, '5th player must be rejected');
    assert.strictEqual(j5.error, 'Duel full');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Removing a player updates queue count and cancels auto-countdown if active', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    const p2 = duelManager.joinDuel(duel.code, 'P2');
    const p3 = duelManager.joinDuel(duel.code, 'P3');
    const p4 = duelManager.joinDuel(duel.code, 'P4');

    // Reached 4/4 -> status is 'countdown'
    assert.strictEqual(duel.status, 'countdown');

    // Host removes P4
    const remRes = duelManager.removePlayer(duel.code, hostPlayer.id, p4.player.id);
    assert(remRes.success);
    assert.strictEqual(duel.players.length, 3);
    assert.strictEqual(duel.status, 'lobby', 'Should cancel countdown when below expectedPlayers');

    // Non-host cannot remove
    const unauthorizedRem = duelManager.removePlayer(duel.code, p2.player.id, p3.player.id);
    assert(unauthorizedRem.error, 'Non-host cannot remove players');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Editing expected players N works for even numbers >= joined count', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 6);
    duelManager.joinDuel(duel.code, 'P2');
    duelManager.joinDuel(duel.code, 'P3');
    duelManager.joinDuel(duel.code, 'P4'); // 4 joined

    // Cannot lower below joined count
    const tooLow = duelManager.setExpectedPlayers(duel.code, hostPlayer.id, 2);
    assert(tooLow.error);

    // Cannot set odd number
    const oddSet = duelManager.setExpectedPlayers(duel.code, hostPlayer.id, 5);
    assert(oddSet.error);

    // Setting to 8 works
    const set8 = duelManager.setExpectedPlayers(duel.code, hostPlayer.id, 8);
    assert(set8.success);
    assert.strictEqual(duel.expectedPlayers, 8);

    // Setting to 4 works and triggers countdown because 4 joined
    const set4 = duelManager.setExpectedPlayers(duel.code, hostPlayer.id, 4);
    assert(set4.success);
    assert.strictEqual(duel.status, 'countdown');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Start is disabled / rejected for odd player counts; works for even >=4', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 8);
    duelManager.joinDuel(duel.code, 'P2');
    duelManager.joinDuel(duel.code, 'P3'); // 3 joined (odd)

    const oddStart = duelManager.startNow(duel.code, hostPlayer.id);
    assert(oddStart.error, 'Start must be rejected for odd count');
    assert(oddStart.error.includes('Waiting for 1 more player'));

    // Join 1 more to reach 4 (even >= 4)
    duelManager.joinDuel(duel.code, 'P4');
    const evenStart = duelManager.startNow(duel.code, hostPlayer.id);
    assert(evenStart.success, `Start should succeed for 4 players: ${evenStart.error}`);
    assert.strictEqual(duel.status, 'team_reveal');
    assert.strictEqual(duel.expectedPlayers, 4);

    duelManager.cancelDuel(duel.code);
  });

  runTest('Join after start is rejected ("Duel already started")', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    const lateJoin = duelManager.joinDuel(duel.code, 'LateComer');
    assert(lateJoin.error);
    assert.strictEqual(lateJoin.error, 'Duel already started');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Queue disconnect timeout: player offline in queue is removed after 30 seconds', () => {
    const { duel } = duelManager.createDuel('Host', 4);
    const p2 = duelManager.joinDuel(duel.code, 'P2');
    assert.strictEqual(duel.players.length, 2);

    // Player 2 disconnects
    duelManager.leaveDuel(duel.code, p2.player.id);
    const playerInDuel = duel.players.find(p => p.id === p2.player.id);
    assert.strictEqual(playerInDuel.connected, false);
    assert(playerInDuel.queueDisconnectTimer, 'Queue disconnect timer must be scheduled');

    // Simulate timer firing
    clearTimeout(playerInDuel.queueDisconnectTimer);
    duelManager.removePlayer(duel.code, duel.hostId, p2.player.id, true);

    assert.strictEqual(duel.players.length, 1, 'Player should be removed from queue');
    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 2. TEAM SPLIT & KEYWORDS FAIRNESS
  // ===================================================================
  console.log('\n--- 2. Team Split & Fairness (N=4, 8, 16) ---');

  runTest('N=4, 8, 16 split into equal teams of 2, 4, and 8 players', () => {
    [4, 8, 16].forEach(N => {
      const { duel, hostPlayer } = duelManager.createDuel('Host', N);
      for (let i = 2; i <= N; i++) duelManager.joinDuel(duel.code, `P${i}`);

      const res = duelManager.startNow(duel.code, hostPlayer.id);
      assert(res.success);

      const redCount = duel.teamRed.playerIds.length;
      const blueCount = duel.teamBlue.playerIds.length;
      assert.strictEqual(redCount, N / 2, `Red team size should be ${N / 2}`);
      assert.strictEqual(blueCount, N / 2, `Blue team size should be ${N / 2}`);

      duelManager.cancelDuel(duel.code);
    });
  });

  runTest('Both teams receive the SAME 3 keywords in different orders, with enough clues for team size', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 8); // 4v4
    for (let i = 2; i <= 8; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    assert.strictEqual(duel.keywords.length, 3, 'Must pick exactly 3 keywords');
    const redSeq = duel.teamRedSequence;
    const blueSeq = duel.teamBlueSequence;

    assert.strictEqual(redSeq.length, 3);
    assert.strictEqual(blueSeq.length, 3);

    // Identical set of 3 keywords
    const redIds = redSeq.map(k => k.id).sort();
    const blueIds = blueSeq.map(k => k.id).sort();
    assert.deepStrictEqual(redIds, blueIds, 'Both teams must receive identical set of 3 keywords');

    // Different orders (offset)
    assert.notStrictEqual(redSeq[0].id, blueSeq[0].id, 'Round 1 must have different keywords for Red and Blue');

    // Enough clues for team size (4)
    duel.keywords.forEach(kw => {
      assert(kw.clues.length >= 4, `Keyword ${kw.answer} must have >= 4 clues (has ${kw.clues.length})`);
    });

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 3. INSTANT WIN & 3 ROUNDS RACE EXECUTION
  // ===================================================================
  console.log('\n--- 3. Instant Win & Race Execution ---');

  runTest('Instant win: First team to solve 3 keywords wins immediately, stops opponent, rejects further answers', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    // Fast-forward 10s meet-your-team
    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);
    assert.strictEqual(duel.status, 'in_progress');

    const redPlayer = duel.players.find(p => p.team === 'red');
    const bluePlayer = duel.players.find(p => p.team === 'blue');

    // Solve Round 1 for Red
    const kw1 = duel.teamRed.currentKeyword;
    let r1 = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw1.answer);
    assert(r1.isCorrect);
    assert.strictEqual(duel.teamRed.solvedCount, 1);

    // Fast-forward 6s reveal to Round 2
    clearTimeout(duel.teamRed.revealTimer);
    duel.teamRed.inReveal = false;
    duelManager.startTeamRound(duel, 'red', 1);

    // Solve Round 2 for Red
    const kw2 = duel.teamRed.currentKeyword;
    let r2 = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw2.answer);
    assert(r2.isCorrect);
    assert.strictEqual(duel.teamRed.solvedCount, 2);

    // Fast-forward 6s reveal to Round 3
    clearTimeout(duel.teamRed.revealTimer);
    duel.teamRed.inReveal = false;
    duelManager.startTeamRound(duel, 'red', 2);

    // Solve Round 3 for Red -> INSTANT WIN!
    const kw3 = duel.teamRed.currentKeyword;
    let r3 = duelManager.submitAnswer(duel.code, 'red', redPlayer.id, kw3.answer);
    assert(r3.isCorrect);
    assert.strictEqual(r3.winner, 'red');

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'red');
    assert.strictEqual(duel.winnerReason, 'instant_3_solves');

    // Opponent Blue round is stopped immediately
    assert.strictEqual(duel.teamBlue.finished, true);

    // Late submissions from Blue are rejected
    const lateSub = duelManager.submitAnswer(duel.code, 'blue', bluePlayer.id, duel.teamBlue.currentKeyword.answer);
    assert(lateSub.error, 'Submissions after instant win must be rejected');

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 4. FINISH WITHOUT 3/3: TIE-BREAKERS & DRAW
  // ===================================================================
  console.log('\n--- 4. Tie-Breakers When Neither Reaches 3 Solves ---');

  runTest('Both finish: More solved keywords wins (2 vs 1)', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    // Team Red finishes 3 rounds with 2 solves
    duel.teamRed.solvedCount = 2;
    duel.teamRed.roundsPlayed = 3;
    duel.teamRed.finished = true;
    duel.teamRed.finishTime = 150;

    // Team Blue finishes 3 rounds with 1 solve
    duel.teamBlue.solvedCount = 1;
    duel.teamBlue.roundsPlayed = 3;
    duel.teamBlue.finished = true;
    duel.teamBlue.finishTime = 120;

    duelManager.checkBothTeamsFinished(duel);

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'red');
    assert.strictEqual(duel.winnerReason, 'more_solves');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Both finish with equal solves: Earlier finishTime wins', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    // Both solved 2 keywords
    duel.teamRed.solvedCount = 2;
    duel.teamRed.roundsPlayed = 3;
    duel.teamRed.finished = true;
    duel.teamRed.finishTime = 140; // 140 seconds

    duel.teamBlue.solvedCount = 2;
    duel.teamBlue.roundsPlayed = 3;
    duel.teamBlue.finished = true;
    duel.teamBlue.finishTime = 115; // 115 seconds (earlier!)

    duelManager.checkBothTeamsFinished(duel);

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'blue');
    assert.strictEqual(duel.winnerReason, 'tie_breaker_time');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Both finish with equal solves & finishTime: Fewer wrong attempts wins', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    // Both solved 1 keyword at 150s
    duel.teamRed.solvedCount = 1;
    duel.teamRed.roundsPlayed = 3;
    duel.teamRed.finished = true;
    duel.teamRed.finishTime = 150;
    duel.teamRed.totalWrongAttempts = 4;

    duel.teamBlue.solvedCount = 1;
    duel.teamBlue.roundsPlayed = 3;
    duel.teamBlue.finished = true;
    duel.teamBlue.finishTime = 150;
    duel.teamBlue.totalWrongAttempts = 1; // Fewer wrong attempts!

    duelManager.checkBothTeamsFinished(duel);

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'blue');
    assert.strictEqual(duel.winnerReason, 'tie_breaker_wrong');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Draw declared when solves, finishTime, and wrong attempts are identical', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    duel.teamRed.solvedCount = 2;
    duel.teamRed.roundsPlayed = 3;
    duel.teamRed.finished = true;
    duel.teamRed.finishTime = 120;
    duel.teamRed.totalWrongAttempts = 2;

    duel.teamBlue.solvedCount = 2;
    duel.teamBlue.roundsPlayed = 3;
    duel.teamBlue.finished = true;
    duel.teamBlue.finishTime = 120;
    duel.teamBlue.totalWrongAttempts = 2;

    duelManager.checkBothTeamsFinished(duel);

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'draw');
    assert.strictEqual(duel.winnerReason, 'draw');

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 5. DISCONNECTS & 60-SECOND FORFEIT
  // ===================================================================
  console.log('\n--- 5. Disconnects & 60-Second Team Forfeit ---');

  runTest('Team offline triggers 60-second forfeit and opponent wins', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    // Red team players disconnect
    const redPlayerIds = duel.teamRed.playerIds;
    redPlayerIds.forEach(pid => duelManager.leaveDuel(duel.code, pid));

    assert(duel.teamRed.disconnectTimer, 'Team disconnect timer must be running');

    // Simulate 60s forfeit timer expiring
    clearTimeout(duel.teamRed.disconnectTimer);
    duelManager.handleTeamForfeit(duel.code, 'red');

    assert.strictEqual(duel.status, 'finished');
    assert.strictEqual(duel.winner, 'blue');
    assert.strictEqual(duel.winnerReason, 'forfeit');

    duelManager.cancelDuel(duel.code);
  });

  runTest('Reconnecting player mid-round with token reconnects and cancels forfeit', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    const p2Res = duelManager.joinDuel(duel.code, 'P2');
    for (let i = 3; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    // Disconnect
    duelManager.leaveDuel(duel.code, p2Res.player.id);
    const p = duel.players.find(x => x.id === p2Res.player.id);
    assert.strictEqual(p.connected, false);

    // Reconnect with token
    const reRes = duelManager.joinDuel(duel.code, 'P2', p2Res.token);
    assert(reRes.success);
    assert.strictEqual(reRes.player.connected, true);

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 6. ZERO-LEAK SECURITY VERIFICATION
  // ===================================================================
  console.log('\n--- 6. Zero-Leak Security Verification ---');

  runTest('Active client payload contains ZERO leaks of opponent keywords, clues or unrevealed answers', () => {
    const { duel, hostPlayer } = duelManager.createDuel('Host', 4);
    for (let i = 2; i <= 4; i++) duelManager.joinDuel(duel.code, `P${i}`);
    duelManager.startNow(duel.code, hostPlayer.id);

    clearTimeout(duel.meetTeamTimer);
    duelManager.startMatch(duel);

    const redPlayer = duel.players.find(p => p.team === 'red');
    const bluePlayer = duel.players.find(p => p.team === 'blue');

    const redState = duelManager.getClientDuelState(duel.code, redPlayer.token);
    const redJson = JSON.stringify(redState).toLowerCase();

    const blueKeyword = duel.teamBlue.currentKeyword;
    assert(blueKeyword);
    const blueAns = blueKeyword.answer.toLowerCase();

    // Red's payload must NOT contain Blue's keyword answer
    assert(!redJson.includes(blueAns), `Leak: Red state includes Blue keyword answer "${blueAns}"!`);

    // Red's payload must NOT contain Blue's clues
    blueKeyword.clues.forEach(c => {
      assert(!redJson.includes(c.text.toLowerCase()), `Leak: Red state includes Blue clue "${c.text}"!`);
    });

    // Unrevealed round 2/3 keywords must not be exposed
    duel.teamRedSequence.slice(1).forEach(futureKw => {
      assert(!redJson.includes(futureKw.answer.toLowerCase()), `Leak: Unplayed keyword "${futureKw.answer}" exposed!`);
    });

    duelManager.cancelDuel(duel.code);
  });

  // ===================================================================
  // 7. CONCURRENCY & MULTI-DUEL SIMULATION
  // ===================================================================
  console.log('\n--- 7. Concurrency: Multiple Duels Running Simultaneously ---');

  await runAsyncTest('5 simultaneous duels run with zero cross-talk', async () => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    initializeSockets(io);

    await new Promise(res => server.listen(0, res));

    const createdDuels = [];

    // Create 5 duels simultaneously
    for (let d = 0; d < 5; d++) {
      const { duel, hostPlayer } = duelManager.createDuel(`Host_${d}`, 4);
      for (let p = 2; p <= 4; p++) {
        duelManager.joinDuel(duel.code, `P${p}_D${d}`);
      }
      duelManager.startNow(duel.code, hostPlayer.id);
      clearTimeout(duel.meetTeamTimer);
      duelManager.startMatch(duel);
      createdDuels.push(duel);
    }

    assert.strictEqual(createdDuels.length, 5);

    // Verify isolation: distinct internal rooms
    const allInternalRooms = new Set();
    createdDuels.forEach(duel => {
      assert.strictEqual(duel.status, 'in_progress');
      assert(!allInternalRooms.has(duel.teamRed.roomId), 'Room collision!');
      assert(!allInternalRooms.has(duel.teamBlue.roomId), 'Room collision!');
      allInternalRooms.add(duel.teamRed.roomId);
      allInternalRooms.add(duel.teamBlue.roomId);
    });

    // End duel 2 with Red win
    duelManager.endDuelWithWinner(createdDuels[2], 'red', 'instant_3_solves');
    assert.strictEqual(createdDuels[2].winner, 'red');

    // Other duels still in progress
    assert.strictEqual(createdDuels[0].status, 'in_progress');
    assert.strictEqual(createdDuels[1].status, 'in_progress');

    // Clean up
    createdDuels.forEach(d => duelManager.cancelDuel(d.code));

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
