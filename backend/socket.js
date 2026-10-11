const gameManager = require('./gameManager');
const eventManager = require('./eventManager');
const duelManager = require('./duelManager');
const { getCategoryMeta } = require('./config/categories');

duelManager.setGameManager(gameManager);

function initializeSockets(io) {
  duelManager.setIo(io);
  duelManager.onTeamRoomUpdate = (teamRoomId) => {
    emitGameState(teamRoomId);
  };

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

    if (room.mode === 'duel_team' && room.duelCode) {
      baseRoomData.duelCode = room.duelCode;
      baseRoomData.duelTeam = room.duelTeam;
      baseRoomData.duelInfo = duelManager.getClientDuelState(room.duelCode);
    }

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
      const finishedPayload = {
        ...baseRoomData,
        challenge: {
          answer: room.currentChallenge?.answer,
          category: room.currentChallenge?.category
        },
        lastRoundScoreBreakdown: room.lastRoundScoreBreakdown,
        lastRoundSuccess: room.lastRoundSuccess,
        lastRoundReason: room.lastRoundReason,
        allClues: room.lastRoundAllClues || room.players.map(p => ({ name: p.name, clue: p.clue }))
      };
      if (room.mode === 'duel_team' && room.duelCode) {
        finishedPayload.duelFinalResult = duelManager.getClientDuelState(room.duelCode);
      }
      io.to(roomCode).emit('room_update', finishedPayload);
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

          const playerPayload = {
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
          };

          if (room.mode === 'duel_team' && room.duelCode) {
            playerPayload.duelInfo = duelManager.getClientDuelState(room.duelCode, p.token);
          }

          io.to(p.socketId).emit('room_update', playerPayload);
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

    // Duel Mode Socket Handlers
    socket.on('create_duel', ({ nickname, expectedPlayers }, callback) => {
      try {
        const res = duelManager.createDuel(nickname, expectedPlayers);
        const { duel, hostPlayer } = res;

        socket.join(`duel_${duel.code}`);
        socket.duelCode = duel.code;
        socket.duelPlayerId = hostPlayer.id;
        hostPlayer.socketId = socket.id;

        if (typeof callback === 'function') {
          callback({
            success: true,
            duelCode: duel.code,
            token: hostPlayer.token,
            playerId: hostPlayer.id,
            duelState: duelManager.getClientDuelState(duel.code, hostPlayer.token),
          });
        }

        io.to(`duel_${duel.code}`).emit('duel_update', duelManager.getAudienceState(duel.code));
        io.to(`duel_${duel.code}`).emit('duel_lobby_state', duelManager.getClientDuelState(duel.code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('join_duel', ({ code, nickname, token }, callback) => {
      try {
        const res = duelManager.joinDuel(code, nickname, token);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        const { duel, player } = res;
        socket.join(`duel_${duel.code}`);
        socket.duelCode = duel.code;
        socket.duelPlayerId = player.id;
        player.socketId = socket.id;

        if (typeof callback === 'function') {
          callback({
            success: true,
            duelCode: duel.code,
            token: player.token,
            playerId: player.id,
            duelState: duelManager.getClientDuelState(duel.code, player.token),
          });
        }

        io.to(`duel_${duel.code}`).emit('duel_update', duelManager.getAudienceState(duel.code));
        io.to(`duel_${duel.code}`).emit('duel_lobby_state', duelManager.getClientDuelState(duel.code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('remove_duel_player', ({ code, playerId }, callback) => {
      try {
        const res = duelManager.removePlayer(code, socket.duelPlayerId, playerId);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        io.to(`duel_${code}`).emit('duel_update', duelManager.getAudienceState(code));
        io.to(`duel_${code}`).emit('duel_lobby_state', duelManager.getClientDuelState(code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('set_duel_expected_players', ({ code, expectedPlayers }, callback) => {
      try {
        const res = duelManager.setExpectedPlayers(code, socket.duelPlayerId, expectedPlayers);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        io.to(`duel_${code}`).emit('duel_update', duelManager.getAudienceState(code));
        io.to(`duel_${code}`).emit('duel_lobby_state', duelManager.getClientDuelState(code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('start_duel_now', ({ code }, callback) => {
      try {
        const res = duelManager.startNow(code, socket.duelPlayerId);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        io.to(`duel_${code}`).emit('duel_update', duelManager.getAudienceState(code));
        io.to(`duel_${code}`).emit('duel_lobby_state', duelManager.getClientDuelState(code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('rename_duel_teams', ({ code, teamRedName, teamBlueName }, callback) => {
      try {
        const res = duelManager.renameTeams(code, socket.duelPlayerId, teamRedName, teamBlueName);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        io.to(`duel_${code}`).emit('duel_update', duelManager.getAudienceState(code));
        io.to(`duel_${code}`).emit('duel_lobby_state', duelManager.getClientDuelState(code));
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('start_duel', ({ code }, callback) => {
      try {
        const res = duelManager.startNow(code, socket.duelPlayerId);
        if (res.error) {
          if (typeof callback === 'function') return callback({ error: res.error });
          return;
        }

        if (typeof callback === 'function') callback({ success: true });
        io.to(`duel_${code}`).emit('duel_update', duelManager.getAudienceState(code));
        io.to(`duel_${code}`).emit('duel_lobby_state', duelManager.getClientDuelState(code));
        io.emit('arena_update', duelManager.getArenaData());
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message || 'Server error' });
      }
    });

    socket.on('get_duel_state', ({ code, token }, callback) => {
      const state = duelManager.getClientDuelState(code, token);
      if (typeof callback === 'function') {
        callback({ success: !!state, duelState: state });
      }
    });

    socket.on('join_duel_audience', ({ code }, callback) => {
      socket.join(`duel_${code}`);
      const audienceState = duelManager.getAudienceState(code);
      if (typeof callback === 'function') {
        callback({ success: !!audienceState, audienceState });
      }
    });

    socket.on('join_arena', (callback) => {
      socket.join('arena');
      const arenaData = duelManager.getArenaData();
      if (typeof callback === 'function') {
        callback({ success: true, arenaData });
      }
    });

    socket.on('admin_force_end_duel', ({ code, password }, callback) => {
      if (password !== process.env.ADMIN_PASSWORD) {
        return callback({ error: 'Unauthorized' });
      }
      const duel = duelManager.getDuel(code);
      if (!duel) return callback({ error: 'Duel not found' });
      duelManager.endDuelWithWinner(duel, 'draw', 'admin_ended');
      callback({ success: true });
    });

    socket.on('admin_cancel_duel', ({ code, password }, callback) => {
      if (password !== process.env.ADMIN_PASSWORD) {
        return callback({ error: 'Unauthorized' });
      }
      const res = duelManager.cancelDuel(code);
      callback(res);
    });

    socket.on('admin_mark_chocolate', ({ code, awarded, password }, callback) => {
      if (password !== process.env.ADMIN_PASSWORD) {
        return callback({ error: 'Unauthorized' });
      }
      const res = duelManager.markChocolateAwarded(code, awarded);
      callback(res);
    });

    const handleDisconnectWithDuel = () => {
      handleDisconnect();
      if (socket.duelCode && socket.duelPlayerId) {
        const duel = duelManager.leaveDuel(socket.duelCode, socket.duelPlayerId);
        if (duel) {
          io.to(`duel_${duel.code}`).emit('duel_update', duelManager.getAudienceState(duel.code));
          io.to(`duel_${duel.code}`).emit('duel_lobby_state', duelManager.getClientDuelState(duel.code));
          io.emit('arena_update', duelManager.getArenaData());
        }
      }
    };

    socket.on('disconnect', handleDisconnectWithDuel);
  });
}

module.exports = { initializeSockets };
