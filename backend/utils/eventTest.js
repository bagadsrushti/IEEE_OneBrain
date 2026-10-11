const assert = require('assert');
const eventManager = require('../eventManager');
const gameManager = require('../gameManager');
const challenges = require('../data/challenges.json');
const {
  EVENT_ROUNDS,
  UNSOLVED_PENALTY,
  WRONG_ATTEMPT_PENALTY,
  HINT_PENALTY,
  REVEAL_DURATION_SECONDS,
} = require('../config/eventConfig');

console.log('--- STARTING EVENT MODE TEST SUITE ---\n');

function runAllTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // 1. Fair Pool Generation & Clue Counts
  test('1. Fair Pool: 3 keywords with identical clue count & category spread', () => {
    eventManager.resetEvent();
    const event = eventManager.createEvent({
      name: 'Championship Test',
      maxConcurrentTeams: 5,
      category: 'Mixed',
    });
    assert.strictEqual(event.status, 'draft');

    const opened = eventManager.openEvent(challenges);
    assert.strictEqual(opened.status, 'live');

    const pool = eventManager.getPool();
    assert.strictEqual(pool.length, 3, 'Pool must have exactly 3 keywords');
    
    // Check that all 3 keywords have the exact same clue count
    const clueCount = pool[0].clues.length;
    assert.ok(clueCount >= 4, 'Clue count should be at least 4');
    assert.strictEqual(pool[1].clues.length, clueCount, 'Keyword 2 must have identical clue count');
    assert.strictEqual(pool[2].clues.length, clueCount, 'Keyword 3 must have identical clue count');

    // For Mixed, distinct categories should be preferred
    const categories = new Set(pool.map(c => c.category));
    assert.ok(categories.size >= 2, 'Mixed pool should span distinct categories');
  });

  // 2. Team Shuffled Keyword Order
  test('2. Fairness: Each team receives same 3 keywords in independent shuffled orders', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Order Test', maxConcurrentTeams: 5, category: 'Mixed' });
    eventManager.openEvent(challenges);
    const pool = eventManager.getPool();

    const reg1 = eventManager.registerTeamRoom('ROOM_A', 'Alpha Team');
    const reg2 = eventManager.registerTeamRoom('ROOM_B', 'Beta Team');

    assert.strictEqual(reg1.teamName, 'Alpha Team');
    assert.strictEqual(reg1.isPractice, false);

    const kwA1 = eventManager.getTeamKeywordForRound('ROOM_A', 1);
    const kwA2 = eventManager.getTeamKeywordForRound('ROOM_A', 2);
    const kwA3 = eventManager.getTeamKeywordForRound('ROOM_A', 3);

    const kwB1 = eventManager.getTeamKeywordForRound('ROOM_B', 1);
    const kwB2 = eventManager.getTeamKeywordForRound('ROOM_B', 2);
    const kwB3 = eventManager.getTeamKeywordForRound('ROOM_B', 3);

    // Both teams receive keywords from the pool
    const poolAnswers = new Set(pool.map(c => c.answer));
    assert.ok(poolAnswers.has(kwA1.answer) && poolAnswers.has(kwA2.answer) && poolAnswers.has(kwA3.answer));
    assert.ok(poolAnswers.has(kwB1.answer) && poolAnswers.has(kwB2.answer) && poolAnswers.has(kwB3.answer));

    // Neither team gets duplicate keywords across rounds
    assert.notStrictEqual(kwA1.answer, kwA2.answer);
    assert.notStrictEqual(kwA2.answer, kwA3.answer);
    assert.notStrictEqual(kwB1.answer, kwB2.answer);
  });

  // 3. Scoring Formula with Penalties
  test('3. Scoring: Correctly computes penalties for solved and unsolved rounds', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Scoring Test', maxConcurrentTeams: 5 });
    eventManager.openEvent(challenges);

    eventManager.registerTeamRoom('ROOM_SC', 'Scorers');

    // Round 1: Solved in 40s with 1 wrong attempt (+5s) and 1 hint (+10s) => 40 + 5 + 10 = 55s
    const r1 = eventManager.recordRoundResult('ROOM_SC', 1, {
      answer: 'Keyword 1',
      solved: true,
      secondsUsed: 40,
      wrongAttempts: 1,
      hintsUsed: 1,
    });
    assert.strictEqual(r1.roundTime, 55);

    // Round 2: Unsolved (120s base) + 30s penalty + 2 wrong (+10s) + 0 hints => 120 + 30 + 10 = 160s
    const r2 = eventManager.recordRoundResult('ROOM_SC', 2, {
      answer: 'Keyword 2',
      solved: false,
      secondsUsed: 120,
      wrongAttempts: 2,
      hintsUsed: 0,
    });
    assert.strictEqual(r2.roundTime, 160);

    // Round 3: Solved in 25s with 0 wrong and 0 hints => 25s
    const r3 = eventManager.recordRoundResult('ROOM_SC', 3, {
      answer: 'Keyword 3',
      solved: true,
      secondsUsed: 25,
      wrongAttempts: 0,
      hintsUsed: 0,
    });
    assert.strictEqual(r3.roundTime, 25);

    const final = eventManager.completeTeamRun('ROOM_SC', ['P1', 'P2', 'P3'], 3);
    assert.strictEqual(final.totalTime, 55 + 160 + 25);
    assert.strictEqual(final.roundsSolved, 2);
    assert.strictEqual(final.status, 'completed');
  });

  // 4. Tie-breaking and Ranking Logic
  test('4. Ranking & Tie-breakers: Complete > Incomplete, Solved count > Time > Wrong > Hints > R1', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Rank Test', maxConcurrentTeams: 10 });
    eventManager.openEvent(challenges);

    // Team 1: Completed, 3/3 solved, Total Time 100s
    eventManager.registerTeamRoom('T1', 'Team One');
    eventManager.recordRoundResult('T1', 1, { answer: 'A', solved: true, secondsUsed: 30, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.recordRoundResult('T1', 2, { answer: 'B', solved: true, secondsUsed: 35, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.recordRoundResult('T1', 3, { answer: 'C', solved: true, secondsUsed: 35, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.completeTeamRun('T1', ['A'], 3);

    // Team 2: Completed, 3/3 solved, Total Time 100s (Tied on time!), but 1 wrong attempt
    eventManager.registerTeamRoom('T2', 'Team Two');
    eventManager.recordRoundResult('T2', 1, { answer: 'A', solved: true, secondsUsed: 25, wrongAttempts: 1, hintsUsed: 0 }); // 25+5=30
    eventManager.recordRoundResult('T2', 2, { answer: 'B', solved: true, secondsUsed: 35, wrongAttempts: 0, hintsUsed: 0 }); // 35
    eventManager.recordRoundResult('T2', 3, { answer: 'C', solved: true, secondsUsed: 35, wrongAttempts: 0, hintsUsed: 0 }); // 35 => total 100s
    eventManager.completeTeamRun('T2', ['B'], 3);

    // Team 3: Completed, 2/3 solved (unsolved round 2), Total Time 200s
    eventManager.registerTeamRoom('T3', 'Team Three');
    eventManager.recordRoundResult('T3', 1, { answer: 'A', solved: true, secondsUsed: 20, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.recordRoundResult('T3', 2, { answer: 'B', solved: false, secondsUsed: 120, wrongAttempts: 0, hintsUsed: 0 }); // 120+30=150
    eventManager.recordRoundResult('T3', 3, { answer: 'C', solved: true, secondsUsed: 30, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.completeTeamRun('T3', ['C'], 3);

    // Team 4: Incomplete (dropped out after round 1), solved 1 round in 20s
    eventManager.registerTeamRoom('T4', 'Team Incomplete');
    eventManager.recordRoundResult('T4', 1, { answer: 'A', solved: true, secondsUsed: 20, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.markTeamIncomplete('T4', 'Disconnected');

    const board = eventManager.getLeaderboard();
    assert.strictEqual(board.length, 4);

    // Team 1 should be #1 (0 wrong vs 1 wrong on T2)
    assert.strictEqual(board[0].teamName, 'Team One');
    // Team 2 should be #2
    assert.strictEqual(board[1].teamName, 'Team Two');
    // Team 3 should be #3 (3/3 solved beat 2/3 solved)
    assert.strictEqual(board[2].teamName, 'Team Three');
    // Incomplete team must always be ranked below all completed runs regardless of time!
    assert.strictEqual(board[3].teamName, 'Team Incomplete');
    assert.strictEqual(board[3].status, 'incomplete');
  });

  // 5. Capacity Control & Queue Dispatch
  test('5. Capacity Control: Queueing when full (max=2), auto-dispatch when slot frees up', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Cap Test', maxConcurrentTeams: 2 });
    eventManager.openEvent(challenges);

    eventManager.registerTeamRoom('ROOM_1', 'Team 1');
    eventManager.registerTeamRoom('ROOM_2', 'Team 2');
    assert.strictEqual(eventManager.canStartTeamImmediately(), true);
    assert.strictEqual(eventManager.activateTeam('ROOM_1'), true);
    assert.strictEqual(eventManager.activateTeam('ROOM_2'), true);

    // Capacity is now 2/2 full
    assert.strictEqual(eventManager.canStartTeamImmediately(), false);

    // ROOM_3 arrives and gets queued
    const pos = eventManager.enqueueTeam('ROOM_3', 'Queued Team');
    assert.strictEqual(pos, 1, 'First queued team is at position 1');

    const usage = eventManager.getSlotUsage();
    assert.strictEqual(usage.activeCount, 2);
    assert.strictEqual(usage.waitingCount, 1);
    assert.strictEqual(usage.formatted, 'Slots 2/2 in use, 1 team waiting');

    // ROOM_1 finishes its run
    eventManager.completeTeamRun('ROOM_1', ['Player'], 3);
    assert.strictEqual(eventManager.canStartTeamImmediately(), true, 'Slot should now be free');

    // Next queued team is dispatched
    const next = eventManager.getNextQueuedTeam();
    assert.strictEqual(next.roomId, 'ROOM_3');
    eventManager.activateTeam(next.roomId);

    const updatedUsage = eventManager.getSlotUsage();
    assert.strictEqual(updatedUsage.activeCount, 2);
    assert.strictEqual(updatedUsage.waitingCount, 0);
  });

  // 6. Practice Runs
  test('6. Practice Runs: Second run with same team name flagged as practice & excluded from podium', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Practice Test', maxConcurrentTeams: 5 });
    eventManager.openEvent(challenges);

    // First run by "Flash"
    const reg1 = eventManager.registerTeamRoom('ROOM_F1', 'Flash');
    assert.strictEqual(reg1.isPractice, false);
    for (let r = 1; r <= 3; r++) {
      eventManager.recordRoundResult('ROOM_F1', r, { answer: 'X', solved: true, secondsUsed: 30, wrongAttempts: 0, hintsUsed: 0 });
    }
    eventManager.completeTeamRun('ROOM_F1', ['Barry'], 3);

    // Second run with same team name "Flash"
    const reg2 = eventManager.registerTeamRoom('ROOM_F2', 'Flash');
    assert.strictEqual(reg2.isPractice, true, 'Second run must be flagged as practice');
    for (let r = 1; r <= 3; r++) {
      eventManager.recordRoundResult('ROOM_F2', r, { answer: 'X', solved: true, secondsUsed: 10, wrongAttempts: 0, hintsUsed: 0 });
    }
    eventManager.completeTeamRun('ROOM_F2', ['Barry'], 3);

    const liveData = eventManager.getLiveLeaderboardData();
    // Podium top 3 should not include practice runs
    assert.strictEqual(liveData.podium.length, 1);
    assert.strictEqual(liveData.podium[0].teamName, 'Flash');
    assert.strictEqual(liveData.podium[0].isPractice, false);

    // The practice run exists in leaderboard but has isPractice: true
    const practiceEntry = eventManager.getLeaderboard().find(e => e.roomId === 'ROOM_F2');
    assert.ok(practiceEntry);
    assert.strictEqual(practiceEntry.isPractice, true);
    assert.ok(practiceEntry.badges.includes('Practice'));
  });

  // 7. Badges Calculation
  test('7. Badges: Award Flawless, No Hints, and Fastest Round', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'Badges Test', maxConcurrentTeams: 5 });
    eventManager.openEvent(challenges);

    eventManager.registerTeamRoom('ROOM_B1', 'Stars');
    // Solved 3/3, 0 wrong (Flawless), 0 hints (No Hints), round 1 in 15s (Fastest Round <= 20s)
    eventManager.recordRoundResult('ROOM_B1', 1, { answer: 'A', solved: true, secondsUsed: 15, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.recordRoundResult('ROOM_B1', 2, { answer: 'B', solved: true, secondsUsed: 25, wrongAttempts: 0, hintsUsed: 0 });
    eventManager.recordRoundResult('ROOM_B1', 3, { answer: 'C', solved: true, secondsUsed: 30, wrongAttempts: 0, hintsUsed: 0 });
    const final = eventManager.completeTeamRun('ROOM_B1', ['P1', 'P2'], 2);

    assert.ok(final.badges.includes('Flawless'), 'Should have Flawless badge');
    assert.ok(final.badges.includes('No Hints'), 'Should have No Hints badge');
    assert.ok(final.badges.includes('Fastest Round'), 'Should have Fastest Round badge');
  });

  // 8. CSV Export
  test('8. CSV Export: Formats all leaderboard rows with proper CSV headers', () => {
    const csv = eventManager.exportResultsCSV();
    assert.ok(csv.includes('Rank,Team Name,Members,Team Size,Rounds Solved,Total Time (s)'));
    assert.ok(csv.includes('"Stars"'));
  });

  // 9. Anti-Cheat: Game payload during Round 1 must not expose Round 2 or 3 keywords or unrevealed answers
  test('9. Anti-Cheat: Payload verification - no unplayed keywords or unrevealed answers in room updates', () => {
    eventManager.resetEvent();
    eventManager.createEvent({ name: 'AntiCheat Test', maxConcurrentTeams: 5 });
    eventManager.openEvent(challenges);

    const roomRes = gameManager.createRoom('event', 'Secret Team');
    const roomId = typeof roomRes === 'string' ? roomRes : roomRes.id;
    const p1 = gameManager.joinRoom(roomId, 'Player1');
    gameManager.joinRoom(roomId, 'Player2');
    gameManager.joinRoom(roomId, 'Player3');

    const startRes = gameManager.startGame(roomId, p1.player.id);
    assert.strictEqual(startRes.error, undefined);

    const room = gameManager.getRoom(roomId);
    assert.strictEqual(room.state, 'ready');

    // Verify room does not leak future rounds
    assert.strictEqual(room.currentRound, 1);
    
    // Check that round 2 and round 3 challenge objects are NOT attached to room
    assert.strictEqual(room.upcomingKeywords, undefined);
    assert.strictEqual(room.allKeywords, undefined);

    // Clean up timer
    if (room.timer) clearTimeout(room.timer);
  });

  console.log(`\n========================================`);
  console.log(`EVENT TEST SUITE: ${passed}/${total} PASSED`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests();
