const fs = require('fs');
const path = require('path');
const usageTracker = require('./usageTracker');
const gameManager = require('../gameManager');

const challengesPath = path.join(__dirname, '../data/challenges.json');
const challenges = JSON.parse(fs.readFileSync(challengesPath, 'utf8'));

let exitCode = 0;
const pass = (msg) => console.log(`✅ PASS: ${msg}`);
const fail = (msg) => { console.error(`❌ FAIL: ${msg}`); exitCode = 1; };

function runTests() {
  console.log("Starting Variety-Aware Selection Tests");
  
  // Clear tracker for clean test
  usageTracker.resetRotation();
  
  const mockRoom = {
    id: 'MOCK1',
    category: 'Anime',
    players: [{ id: 'player1' }],
    usedKeywords: new Set()
  };

  // 1. 30 consecutive rounds in one domain use at least 5 different sub-fields, never same sub-field twice in a row.
  const subfieldsUsed = new Set();
  let prevSubfield = null;
  let consecutiveFailure = false;
  
  // Wait, if a tier doesn't have 30 challenges, it will fall back to other tiers, which is fine.
  // We need to actually call getRandomChallenge. 
  // It's not exported, so I'll create a fake room and call startGame to test this via gameManager.
  const code = gameManager.createRoom();
  const host = gameManager.joinRoom(code, 'Host').player;
  for(let i=0; i<3; i++) gameManager.joinRoom(code, `P${i}`); // N=4
  gameManager.setCategory(code, 'Anime', host.id);
  
  for(let i = 0; i < 30; i++) {
    // End the round if it was playing, but it's not started yet on the first iteration
    if (i > 0) gameManager.endRound(code, false, 'test');
    gameManager.getRoom(code).state = 'lobby'; // force lobby to allow start
    
    const startRes = gameManager.startGame(code, host.id, () => {});
    if (startRes.error) {
      fail(`Failed to start game at iteration ${i}: ${startRes.error}`);
      break;
    }
    
    const c = gameManager.getRoom(code).currentChallenge;
    subfieldsUsed.add(c.subfield);
    if (c.subfield === prevSubfield) consecutiveFailure = true;
    prevSubfield = c.subfield;
  }
  
  if (subfieldsUsed.size >= 5) pass("30 rounds used at least 5 different sub-fields.");
  else fail(`Used only ${subfieldsUsed.size} sub-fields in 30 rounds.`);
  
  if (!consecutiveFailure) pass("Never used same sub-field twice in a row.");
  else fail("Used same sub-field twice in a row.");

  // 2. Mixed mode cycles through all 9 domains.
  usageTracker.resetRotation();
  const mixedCode = gameManager.createRoom();
  const mixedHost = gameManager.joinRoom(mixedCode, 'HostM').player;
  for(let i=0; i<3; i++) gameManager.joinRoom(mixedCode, `P${i}`); // N=4
  gameManager.setCategory(mixedCode, 'Mixed', mixedHost.id);

  const domainsUsed = new Set();
  for(let i = 0; i < 9; i++) {
    if (i > 0) gameManager.endRound(mixedCode, false, 'test');
    gameManager.getRoom(mixedCode).state = 'lobby';
    gameManager.startGame(mixedCode, mixedHost.id, () => {});
    domainsUsed.add(gameManager.getRoom(mixedCode).currentChallenge.category);
  }
  if (domainsUsed.size === 9) pass("Mixed mode cycled through all 9 domains.");
  else fail(`Mixed mode only cycled through ${domainsUsed.size} domains.`);

  // 3. A new room's first keyword differs from the previous round event-wide.
  const prevEventKeyword = usageTracker.getPreviousEventKeyword();
  const newRoomCode = gameManager.createRoom();
  const newHost = gameManager.joinRoom(newRoomCode, 'NewH').player;
  for(let i=0; i<3; i++) gameManager.joinRoom(newRoomCode, `P${i}`); // N=4
  gameManager.setCategory(newRoomCode, 'Mixed', newHost.id);
  gameManager.startGame(newRoomCode, newHost.id, () => {});
  const newKeyword = gameManager.getRoom(newRoomCode).currentChallenge.id;
  
  if (newKeyword !== prevEventKeyword) pass("New room's first keyword differs from previous round event-wide.");
  else fail("New room repeated the previous event-wide keyword.");

  // 4. State survives a server restart (usageTracker JSON persistence)
  // We simulate a restart by reading the JSON file directly and ensuring it matches the in-memory tracker.
  const statsPath = path.join(__dirname, '../data/usageStats.json');
  const savedState = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  if (savedState.previousEventKeyword === newKeyword) pass("State survives via JSON persistence.");
  else fail("State persistence failure.");

  process.exit(exitCode);
}

runTests();
