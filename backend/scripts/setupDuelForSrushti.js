const ioClient = require('socket.io-client');

async function setup() {
  const hostSocket = ioClient('http://localhost:3001');

  await new Promise((resolve) => hostSocket.on('connect', resolve));
  console.log('Host connected to server');

  // 1. Create Duel for srushti with expectedPlayers = 4
  const createRes = await new Promise((resolve) => {
    hostSocket.emit('create_duel', { nickname: 'srushti', expectedPlayers: 4 }, resolve);
  });

  if (!createRes.success) {
    console.error('Failed to create duel:', createRes.error);
    process.exit(1);
  }

  const duelCode = createRes.duelCode;
  console.log(`\n========================================`);
  console.log(`DUEL CREATED SUCCESSFULLY!`);
  console.log(`Duel Code: ${duelCode}`);
  console.log(`Host Nickname: srushti`);
  console.log(`Host Token: ${createRes.token}`);
  console.log(`Target Players: 4 (2 vs 2)`);
  console.log(`========================================\n`);

  // 2. Connect 3 more players: Alex, Blake, Charlie
  const otherNames = ['Alex', 'Blake', 'Charlie'];
  const otherSockets = [];

  for (const name of otherNames) {
    const s = ioClient('http://localhost:3001');
    await new Promise((resolve) => s.on('connect', resolve));
    const joinRes = await new Promise((resolve) => {
      s.emit('join_duel', { code: duelCode, nickname: name }, resolve);
    });
    console.log(`Player joined: ${name} (Token: ${joinRes.token})`);
    otherSockets.push(s);
  }

  console.log(`\nAll 4 of 4 players have joined! Waiting queue reached target.\n`);

  // 3. Split teams
  const splitRes = await new Promise((resolve) => {
    hostSocket.emit('start_duel_now', { code: duelCode }, resolve);
  });

  console.log('Team split result:', splitRes);

  // Fetch state to display arrangement
  const stateRes = await new Promise((resolve) => {
    hostSocket.emit('get_duel_state', { code: duelCode, token: createRes.token }, resolve);
  });

  const duel = stateRes.duelState;
  console.log('\n========================================');
  console.log('TEAM ARRANGEMENT');
  console.log(`Status: ${duel.status}`);
  console.log(`Team Red: ${duel.teamRed.name}`);
  console.log(`Team Blue: ${duel.teamBlue.name}`);
  console.log('========================================\n');

  console.log(`Join URL: http://localhost:5173/room/${duelCode}`);
  console.log(`Spectator / Big Screen URL: http://localhost:5173/duel/${duelCode}`);
  console.log(`Arena URL: http://localhost:5173/arena`);

  // Disconnect sockets cleanly
  hostSocket.disconnect();
  otherSockets.forEach((s) => s.disconnect());
  process.exit(0);
}

setup().catch((err) => {
  console.error('Setup error:', err);
  process.exit(1);
});
