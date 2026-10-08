const gameManager = require('../gameManager');
const { getRulesForPlayerCount } = require('../config/gameRules');

console.log("=== ONE BRAIN SIMULATION SCRIPT ===\n");

// We simulate joining N players and starting a round.
// We intercept the room state right after startGame.

function simulateGame(N) {
  console.log(`\n--- Simulating Game for N = ${N} ---`);
  const hostId = 'dummy-host-id';
  
  // Create room manually on the manager side
  const code = gameManager.createRoom();
  const room = gameManager.getRoom(code);
  
  // Force N connected players
  room.players = [];
  for(let i = 0; i < N; i++) {
    room.players.push({
      id: i === 0 ? hostId : `player-${i}`,
      name: `Player ${i}`,
      connected: true,
      clue: null
    });
  }
  room.host = hostId;
  room.category = 'Mixed';
  
  const rules = getRulesForPlayerCount(N);
  if (!rules) {
    console.log(`❌ Failed: Invalid player count ${N}`);
    return;
  }
  
  const result = gameManager.startGame(code, hostId, () => {});
  if (result.error) {
    console.log(`❌ Failed: ${result.error}`);
    return;
  }

  const simulatedRoom = result.room;
  
  // Assertions and checks
  console.log(`✅ Rules used: Tier=${simulatedRoom.roundRules.difficultyTier}, Round=${simulatedRoom.roundRules.roundSeconds}s (Prep=${simulatedRoom.roundRules.prepSeconds}s)`);
  console.log(`✅ Challenge Tier: ${simulatedRoom.currentChallenge.tier}`);
  console.log(`✅ Challenge Answer: ${simulatedRoom.currentChallenge.answer}`);
  
  const angles = new Set();
  const cluesDealt = [];
  
  simulatedRoom.players.forEach(p => {
    cluesDealt.push(p.clue);
    // Find the original clue object to get the angle (since player just gets the string)
    const clueObj = simulatedRoom.currentChallenge.clues.find(c => c.text === p.clue);
    if (clueObj) {
      angles.add(clueObj.angle);
    }
  });
  
  console.log(`✅ Distinct angles dealt: ${angles.size} (Expected: ${N})`);
  if (angles.size !== N) {
    console.log(`❌ ERROR: Did not deal exactly ${N} distinct angles!`);
  } else {
    console.log(`✅ Success: All players received distinct angles.`);
  }

  // Answer leakage check is already done by validateChallenges, but good to sanity check
  const answerLower = simulatedRoom.currentChallenge.answer.toLowerCase();
  let leak = false;
  cluesDealt.forEach((c, idx) => {
    if (c.toLowerCase().includes(answerLower)) {
      console.log(`❌ ERROR: Clue ${idx} leaked answer! "${c}"`);
      leak = true;
    }
  });
  if (!leak) console.log(`✅ No answer leakage detected in dealt clues.`);
  
  // Cleanup
  if (simulatedRoom.timer) clearTimeout(simulatedRoom.timer);
}

for (let N = 3; N <= 8; N++) {
  simulateGame(N);
}

// Test edge cases
console.log(`\n--- Edge Cases ---`);
console.log("Testing N=2 (Should fail)");
const code2 = gameManager.createRoom();
const room2 = gameManager.getRoom(code2);
room2.players = [{id: 'h', connected:true}, {id: '1', connected:true}];
room2.host = 'h';
const res2 = gameManager.startGame(code2, 'h', () => {});
if (res2.error) console.log(`✅ Correctly blocked N=2: ${res2.error}`);
else console.log(`❌ Failed to block N=2`);

console.log("\nSimulation Complete.");
process.exit(0);
