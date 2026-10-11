const ioClient = require('socket.io-client');

const socket = ioClient('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to server with id:', socket.id);

  socket.emit('create_duel', { nickname: 'srushti', expectedPlayers: 4 }, (res) => {
    console.log('create_duel response:', res);
    if (res.success) {
      console.log('Duel created successfully! Code:', res.duelCode);
      console.log('Player Id:', res.playerId);
      console.log('Duel state:', res.duelState);
    } else {
      console.error('Failed to create duel:', res.error);
    }
    socket.disconnect();
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
