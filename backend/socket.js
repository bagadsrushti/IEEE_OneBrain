const gameManager = require('./gameManager');
const { getCategoryMeta } = require('./config/categories');

function initializeSockets(io) {
  io.on('connection', (socket) => {

    const emitGameState = (roomCode) => {
      const room = gameManager.getRoom(roomCode);
      if (!room) return;

      const categoryMeta = getCategoryMeta(room.category) || { emoji: '🎲', color: '#888' };
      const eventTheme = gameManager.getEventTheme();
      const activeThemeMeta = eventTheme ? getCategoryMeta(eventTheme) : null;

      const baseRoomData = {
        id: room.id,
        host: room.host,
        state: room.state,
        score: room.score,
        category: room.category,
        categoryMeta: activeThemeMeta || categoryMeta,
        eventThemeActive: !!eventTheme,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          connected: p.connected
        })),
        readyEndTime: room.readyEndTime,
        roundEndTime: room.roundEndTime,
        sharedHint: room.sharedHint,
        hintsUsed: room.hintsUsed,
        wrongAttempts: room.wrongAttempts,
        roundRules: room.roundRules, // Max attempts, max hints, etc.
      };

      if (room.state === 'finished') {
        io.to(roomCode).emit('room_update', {
          ...baseRoomData,
          challenge: {
            answer: room.currentChallenge?.answer,
            category: room.currentChallenge?.category
          },
          lastRoundScoreBreakdown: room.lastRoundScoreBreakdown,
          lastRoundSuccess: room.lastRoundSuccess,
          lastRoundReason: room.lastRoundReason,
          allClues: room.players.map(p => ({ name: p.name, clue: p.clue }))
        });
      } else if (room.state === 'playing' || room.state === 'ready') {
        room.players.forEach(p => {
          if (p.connected) {
            io.to(p.socketId).emit('room_update', {
              ...baseRoomData,
              myClue: p.clue
            });
          }
        });
      } else {
        io.to(roomCode).emit('room_update', baseRoomData);
      }
    };

    const handleDisconnect = () => {
      if (socket.roomId && socket.playerId) {
        const room = gameManager.leaveRoom(socket.roomId, socket.playerId);
        if (room) emitGameState(room.id);
      }
    };

    socket.on('create_room', ({ nickname }, callback) => {
      try {
        const code = gameManager.createRoom();
        const { room, player, token, error } = gameManager.joinRoom(code, nickname);
        if (error) return callback({ error });

        socket.join(code);
        socket.roomId = code;
        socket.playerId = player.id;
        player.socketId = socket.id;

        callback({ success: true, token, roomCode: code, playerId: player.id });
        emitGameState(code);
      } catch (err) {
        callback({ error: 'Server error' });
      }
    });

    socket.on('join_room', ({ code, nickname, token }, callback) => {
      try {
        const result = gameManager.joinRoom(code, nickname, token);
        if (result.error) return callback({ error: result.error });

        socket.join(code.toUpperCase());
        socket.roomId = code.toUpperCase();
        socket.playerId = result.player.id;
        result.player.socketId = socket.id;

        callback({ success: true, token: result.token, roomCode: socket.roomId, playerId: socket.playerId });
        emitGameState(socket.roomId);
      } catch (err) {
        callback({ error: 'Server error' });
      }
    });

    socket.on('set_category', ({ category }, callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const room = gameManager.setCategory(socket.roomId, category, socket.playerId);
      if (!room) return callback({ error: 'Failed to set category' });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('start_game', (callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      
      const onRoundEnd = (room, reason) => {
        emitGameState(room.id);
      };

      const result = gameManager.startGame(socket.roomId, socket.playerId, onRoundEnd);
      if (result.error) return callback({ error: result.error });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('use_hint', (callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const room = gameManager.useHint(socket.roomId);
      if (!room || room.error) return callback({ error: room?.error || 'Failed to use hint' });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('skip_word', (callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const room = gameManager.getRoom(socket.roomId);
      if (!room || room.host !== socket.playerId) return callback({ error: 'Not authorized' });
      
      const onRoundEnd = (r, reason) => {
        emitGameState(r.id);
      };
      
      room.state = 'lobby';
      const result = gameManager.startGame(socket.roomId, socket.playerId, onRoundEnd);
      if (result.error) return callback({ error: result.error });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('submit_answer', ({ guess }, callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const result = gameManager.submitAnswer(socket.roomId, socket.playerId, guess);
      if (result.error && !result.room) return callback({ error: result.error });
      
      callback({ success: true, isCorrect: result.isCorrect, error: result.error, near: result.near });
      if (result.room) emitGameState(socket.roomId);
    });

    socket.on('next_round', (callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const room = gameManager.nextRound(socket.roomId, socket.playerId);
      if (room.error) return callback({ error: room.error });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('disconnect', handleDisconnect);
  });
}

module.exports = { initializeSockets };
