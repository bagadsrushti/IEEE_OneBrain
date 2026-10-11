const gameManager = require('./gameManager');
const eventManager = require('./eventManager');
const { getCategoryMeta } = require('./config/categories');

function initializeSockets(io) {
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
      mode: room.mode || 'quick',
      teamName: room.teamName || null,
      isPractice: room.isPractice || false,
      currentRound: room.currentRound || 1,
      totalRounds: room.totalRounds || 1,
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
      slotUsage: eventManager.getSlotUsage(),
    };

    if (room.state === 'queued') {
      baseRoomData.queuePosition = eventManager.getQueuePosition(room.id);
    }

    if (room.state === 'reveal') {
      io.to(roomCode).emit('room_update', {
        ...baseRoomData,
        revealData: room.lastRevealData,
        revealEndTime: room.revealEndTime,
      });
    } else if (room.state === 'event_finished') {
      io.to(roomCode).emit('room_update', {
        ...baseRoomData,
        eventFinalResult: room.eventFinalResult,
      });
    } else if (room.state === 'finished') {
      io.to(roomCode).emit('room_update', {
        ...baseRoomData,
        challenge: {
          answer: room.currentChallenge?.answer,
          category: room.currentChallenge?.category
        },
        lastRoundScoreBreakdown: room.lastRoundScoreBreakdown,
        lastRoundSuccess: room.lastRoundSuccess,
        lastRoundReason: room.lastRoundReason,
        allClues: room.lastRoundAllClues || room.players.map(p => ({ name: p.name, clue: p.clue }))
      });
    } else if (room.state === 'playing' || room.state === 'ready') {
      const waveInterval = room.waveIntervalSeconds !== undefined ? room.waveIntervalSeconds : (room.roundRules?.waveIntervalSeconds || 0);
      room.players.forEach(p => {
        if (p.connected && p.socketId) {
          const fullPile = p.fullCluePile || (p.clue ? [{ text: p.clue }] : []);
          const released = p.releasedClues || (p.clue ? [{ text: p.clue, revealedAtWave: 1 }] : []);
          const hasMoreClues = released.length < fullPile.length;

          let nextWaveAt = null;
          if (hasMoreClues && waveInterval > 0 && room.state === 'playing' && room.roundPlayStartTime) {
            const currentWave = room.currentWave || 1;
            nextWaveAt = room.roundPlayStartTime + (currentWave * waveInterval * 1000);
          }

          io.to(p.socketId).emit('room_update', {
            ...baseRoomData,
            myClue: p.clue,
            myClues: released.map((c, idx) => ({
              index: idx + 1,
              text: typeof c === 'string' ? c : c.text,
              revealedAtWave: c.revealedAtWave || (idx + 1),
            })),
            currentWave: room.currentWave || (room.state === 'playing' ? 1 : 0),
            totalWaves: room.totalWaves || 1,
            hasMoreClues,
            nextWaveAt,
            waveIntervalSeconds: waveInterval,
          });
        }
      });
    } else {
      io.to(roomCode).emit('room_update', baseRoomData);
    }
  };

  // Wire clue wave callback for progressive release
  gameManager.setClueWaveCallback((room, wave) => {
    room.players.forEach(p => {
      if (p.connected && p.socketId && p.fullCluePile && p.fullCluePile.length >= wave) {
        const clueObj = p.fullCluePile[wave - 1];
        io.to(p.socketId).emit('new_clue', {
          clue: typeof clueObj === 'string' ? clueObj : clueObj.text,
          clueIndex: wave,
          wave,
          totalWaves: room.totalWaves,
        });
      }
    });
    io.to(room.id).emit('clue_wave_released', { wave, totalWaves: room.totalWaves });
    emitGameState(room.id);
  });

  io.on('connection', (socket) => {

    const handleDisconnect = () => {
      if (socket.roomId && socket.playerId) {
        const room = gameManager.leaveRoom(socket.roomId, socket.playerId);
        if (room) {
          emitGameState(room.id);
          if (room.mode === 'event') {
            io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
          }
        }
      }
    };

    socket.on('create_room', ({ nickname, mode = 'quick', teamName }, callback) => {
      try {
        if (mode === 'event') {
          if (!eventManager.isLive()) {
            return callback({ error: 'Event Mode is not currently live' });
          }
          if (!teamName || typeof teamName !== 'string' || !teamName.trim()) {
            return callback({ error: 'Team name is required for Event Mode' });
          }
        }

        const roomRes = gameManager.createRoom(mode, teamName);
        if (roomRes && typeof roomRes === 'object' && roomRes.error) {
          return callback({ error: roomRes.error });
        }
        const code = typeof roomRes === 'string' ? roomRes : roomRes.id;

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
        if (room.mode === 'event') {
          io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
        }
      };

      const result = gameManager.startGame(socket.roomId, socket.playerId, onRoundEnd);
      if (result.error) return callback({ error: result.error });
      
      callback({ success: true, queued: result.queued, queuePosition: result.queuePosition });
      emitGameState(socket.roomId);
      if (socket.roomId && gameManager.getRoom(socket.roomId)?.mode === 'event') {
        io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
      }
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
      if (room.mode === 'event') return callback({ error: 'Skipping is not permitted in Event Mode' });
      
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
      if (result.room) {
        emitGameState(socket.roomId);
        if (result.room.mode === 'event') {
          io.emit('event_leaderboard_update', eventManager.getLiveLeaderboardData());
        }
      }
    });

    socket.on('next_round', (callback) => {
      if (!socket.roomId) return callback({ error: 'Not in room' });
      const room = gameManager.nextRound(socket.roomId, socket.playerId);
      if (room.error) return callback({ error: room.error });
      
      callback({ success: true });
      emitGameState(socket.roomId);
    });

    socket.on('join_leaderboard', (callback) => {
      socket.join('leaderboard');
      if (typeof callback === 'function') {
        callback({
          success: true,
          data: eventManager.getLiveLeaderboardData(),
          isLive: eventManager.isLive(),
        });
      }
    });

    socket.on('get_event_leaderboard', (callback) => {
      if (typeof callback === 'function') {
        callback({
          success: true,
          data: eventManager.getLiveLeaderboardData(),
          isLive: eventManager.isLive(),
        });
      }
    });

    socket.on('disconnect', handleDisconnect);
  });
}

module.exports = { initializeSockets };
