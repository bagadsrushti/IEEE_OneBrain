const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3001';

async function runEndToEndDuelTest(playerCount = 4) {
  console.log(`\n======================================================`);
  console.log(`RUNNING END-TO-END DUEL TEST FOR ${playerCount} PLAYERS`);
  console.log(`======================================================`);

  const sockets = [];

  const connectSocket = () => {
    return new Promise((resolve) => {
      const s = io(BACKEND_URL);
      s.on('connect', () => resolve(s));
      sockets.push(s);
    });
  };

  try {
    // 1. Host creates the duel
    const hostSocket = await connectSocket();
    const createRes = await new Promise((resolve) => {
      hostSocket.emit('create_duel', { nickname: 'HostPlayer', expectedPlayers: playerCount }, resolve);
    });

    console.log('1. create_duel response:', {
      success: createRes.success,
      duelCode: createRes.duelCode,
      playerId: createRes.playerId,
      expectedPlayers: createRes.duelState?.expectedPlayers,
      joinedCount: createRes.duelState?.joinedCount,
    });

    if (!createRes.success || !createRes.duelCode) {
      throw new Error(`Failed to create duel: ${JSON.stringify(createRes)}`);
    }

    const code = createRes.duelCode;
    console.log(`✅ Duel code successfully generated: ${code}`);

    // 2. Test get_duel_state
    const getStateRes = await new Promise((resolve) => {
      hostSocket.emit('get_duel_state', { code, token: createRes.token }, resolve);
    });
    console.log('2. get_duel_state response status:', getStateRes.duelState?.status);
    if (!getStateRes.success || !getStateRes.duelState) {
      throw new Error('get_duel_state failed');
    }

    // 3. Join the remaining players (playerCount - 1)
    // Alternate between join_room and join_duel to test BOTH join pathways!
    console.log(`3. Joining remaining ${playerCount - 1} players...`);
    for (let i = 2; i <= playerCount; i++) {
      const playerSocket = await connectSocket();
      const nickname = `Player_${i}`;
      const useJoinRoom = i % 2 === 0;

      const eventName = useJoinRoom ? 'join_room' : 'join_duel';
      const joinRes = await new Promise((resolve) => {
        playerSocket.emit(eventName, { code, nickname }, resolve);
      });

      if (!joinRes.success) {
        throw new Error(`${eventName} failed for ${nickname}: ${JSON.stringify(joinRes)}`);
      }
      console.log(`   Player ${i} (${nickname}) joined via ${eventName}. Queue count: ${joinRes.duelState?.joinedCount || joinRes.duelState?.players?.length}`);
    }

    // 4. Verify full queue state
    const fullStateRes = await new Promise((resolve) => {
      hostSocket.emit('get_duel_state', { code, token: createRes.token }, resolve);
    });
    const duelState = fullStateRes.duelState;
    console.log(`4. Queue status: ${duelState.status}, Joined: ${duelState.joinedCount}/${duelState.expectedPlayers}`);

    // 5. Test Start Now
    console.log('5. Host triggers start_duel_now...');
    const startRes = await new Promise((resolve) => {
      hostSocket.emit('start_duel_now', { code }, resolve);
    });
    console.log('   start_duel_now response:', startRes);
    if (!startRes.success) {
      throw new Error(`start_duel_now failed: ${JSON.stringify(startRes)}`);
    }

    // 6. Wait for team reveal state
    await new Promise((r) => setTimeout(r, 600));
    const revealStateRes = await new Promise((resolve) => {
      hostSocket.emit('get_duel_state', { code, token: createRes.token }, resolve);
    });
    const revealDuel = revealStateRes.duelState;
    console.log(`6. Duel state after team split: status=${revealDuel.status}`);
    console.log(`   Team Red: ${revealDuel.teamRed?.name} (${revealDuel.teamRed?.playerCount} players)`);
    console.log(`   Team Blue: ${revealDuel.teamBlue?.name} (${revealDuel.teamBlue?.playerCount} players)`);

    if (revealDuel.teamRed?.playerCount !== playerCount / 2 || revealDuel.teamBlue?.playerCount !== playerCount / 2) {
      throw new Error(`Teams not split equally: Red=${revealDuel.teamRed?.playerCount}, Blue=${revealDuel.teamBlue?.playerCount}`);
    }

    console.log(`✅ All ${playerCount} players divided equally (${playerCount / 2} vs ${playerCount / 2})!`);
    console.log(`✅ TEST FOR ${playerCount} PLAYERS PASSED FULLY!\n`);
  } finally {
    sockets.forEach((s) => s.disconnect());
  }
}

async function main() {
  try {
    for (const count of [4, 6, 8, 12]) {
      await runEndToEndDuelTest(count);
    }
    console.log('🎉 ALL DUEL PLAYER COUNT TESTS PASSED SUCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Duel test error:', err);
    process.exit(1);
  }
}

main();
