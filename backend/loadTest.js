const io = require('socket.io-client');

const backendUrl = 'http://localhost:3001';
const numRooms = 50;
const playersPerRoom = 4;

let connectedClients = 0;
let errors = 0;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function simulateRoom(roomIndex) {
  const hostSocket = io(backendUrl);
  let roomCode = null;

  hostSocket.on('connect', () => connectedClients++);
  hostSocket.on('connect_error', () => errors++);

  hostSocket.emit('create_room', { nickname: `Host_${roomIndex}` }, (res) => {
    if (res.error) {
      console.error('Create room error:', res.error);
      return;
    }
    roomCode = res.roomCode;
    
    // Join other players
    for (let i = 1; i < playersPerRoom; i++) {
      const pSocket = io(backendUrl);
      pSocket.on('connect', () => connectedClients++);
      pSocket.on('connect_error', () => errors++);
      
      pSocket.emit('join_room', { code: roomCode, nickname: `P${i}_${roomIndex}` }, (jRes) => {
        if (jRes.error) console.error('Join error:', jRes.error);
      });
    }
  });

  await sleep(2000); // wait for joins
  if (roomCode) {
    hostSocket.emit('start_game', (res) => {
      if (res.error) console.error('Start game error:', res.error);
    });
  }
}

async function runTest() {
  console.log(`Starting load test with ${numRooms} rooms, ${playersPerRoom} players each...`);
  for (let i = 0; i < numRooms; i++) {
    simulateRoom(i);
    await sleep(50); // stagger creations slightly
  }
  
  setTimeout(() => {
    console.log(`\nLoad test results:`);
    console.log(`Expected connections: ${numRooms * playersPerRoom}`);
    console.log(`Actual connections: ${connectedClients}`);
    console.log(`Errors: ${errors}`);
    process.exit(0);
  }, 10000);
}

runTest();
