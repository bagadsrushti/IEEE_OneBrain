import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getBackendUrl } from './config';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [serverWaking, setServerWaking] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const roomDataRef = useRef(roomData);
  const [myToken, setMyToken] = useState(localStorage.getItem('ob_token'));
  const [myPlayerId, setMyPlayerId] = useState(localStorage.getItem('ob_playerId'));
  const [clockOffset, setClockOffset] = useState(0); // HIGH-3: Clock sync for countdowns

  const [duelState, setDuelState] = useState(null);
  const [duelAudience, setDuelAudience] = useState(null);

  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  useEffect(() => {
    // Determine backend URL
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      setConnectionError('Backend URL is not configured (VITE_SOCKET_URL)');
      return;
    }
    console.log('Resolved backend URL:', backendUrl);
    let healthTimeout;
    setServerWaking(true);
    fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(5000) })
      .then(() => setServerWaking(false))
      .catch(() => setServerWaking(true));
    healthTimeout = setTimeout(() => setServerWaking(false), 60000);

    // MEDIUM-6 FIX: Use transports and reconnection options
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    newSocket.on('connect', () => {
      clearTimeout(healthTimeout);
      setIsConnected(true);
      setConnectionError(null);
      setServerWaking(false);

      const savedDuelCode = localStorage.getItem('ob_duelCode');
      const savedToken = localStorage.getItem('ob_token');
      if (savedDuelCode && savedToken) {
        newSocket.emit('join_duel', { code: savedDuelCode, token: savedToken }, (res) => {
          if (!res?.success) return;
          setDuelState(res.duelState);
          if (res.duelState?.status === 'in_progress' && res.duelState.internalRoomCode) {
            newSocket.emit('join_room', { code: res.duelState.internalRoomCode, token: savedToken }, () => {});
          }
        });
      }

      // HIGH-3: Clock sync on connect for countdown coordination
      const clientSendTime = Date.now();
      newSocket.emit('sync_time', { clientSendTime }, (response) => {
        const clientReceiveTime = Date.now();
        const rtt = clientReceiveTime - clientSendTime;

        // CORRECTED FORMULA: Estimate server time at midpoint
        // offset = serverTime - clientTime (at midpoint)
        // At midpoint: clientTime = clientSendTime + (rtt / 2)
        const offset = response.serverTime - clientSendTime - (rtt / 2);

        setClockOffset(offset);
        console.log(`[Clock Sync] Offset: ${offset}ms, RTT: ${rtt}ms`);
      });
    });

    newSocket.on('connect_error', (err) => {
      setIsConnected(false);
      clearTimeout(healthTimeout);
      setServerWaking(false);
      if (err.message.includes('xhr poll error') || err.message.includes('timeout')) {
        setConnectionError('Server is waking up or unreachable. Retrying...');
      } else {
        setConnectionError(`Connection error: ${err.message}`);
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('room_update', (data) => {
      setRoomData(data);
    });

    newSocket.on('duel_lobby_state', (data) => {
      setDuelState(data);
    });

    newSocket.on('duel_update', (data) => {
      setDuelAudience(data);
    });

    newSocket.on('duel_started', ({ duelCode }) => {
      setTimeout(() => {
        const latestRoom = roomDataRef.current;
        if (latestRoom?.duelCode === duelCode && latestRoom.state === 'playing' && latestRoom.myClues?.length) return;
        const token = localStorage.getItem('ob_token');
        newSocket.emit('get_duel_state', { code: duelCode, token }, (res) => {
          const internalRoomCode = res?.duelState?.internalRoomCode;
          if (internalRoomCode && token) newSocket.emit('join_room', { code: internalRoomCode, token }, () => {});
        });
      }, 3000);
    });

    setSocket(newSocket);

    return () => {
      clearTimeout(healthTimeout);
      newSocket.close();
    };
  }, []);

  const createRoom = (opts, callback) => {
    if (!socket || !isConnected) {
      if (callback) callback({ error: 'Connecting to server. Please try again in a moment.' });
      return;
    }
    const payload = typeof opts === 'object' ? opts : { nickname: opts };
    socket.emit('create_room', payload, (res) => {
      if (res && res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
      }
      if (callback) callback(res || { error: 'No response from server' });
    });
  };

  const createDuel = (opts, callback) => {
    if (!socket || !isConnected) {
      if (callback) callback({ error: 'Connecting to server. Please try again in a moment.' });
      return;
    }
    const payload = typeof opts === 'object' ? opts : { nickname: opts };
    socket.emit('create_duel', payload, (res) => {
      if (res && res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        localStorage.setItem('ob_duelCode', res.duelCode);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        setDuelState(res.duelState);
      }
      if (callback) callback(res || { error: 'No response from server' });
    });
  };

  const joinDuel = (code, nickname, callback) => {
    if (!socket || !isConnected) {
      if (callback) callback({ error: 'Connecting to server. Please try again in a moment.' });
      return;
    }
    const cleanCode = (code || '').toUpperCase().trim();
    socket.emit('join_duel', { code: cleanCode, nickname, token: myToken }, (res) => {
      if (res && res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        localStorage.setItem('ob_duelCode', cleanCode);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        setDuelState(res.duelState);
      }
      if (callback) callback(res || { error: 'No response from server' });
    });
  };

  const joinRoom = (code, nickname, callback) => {
    if (!socket || !isConnected) {
      if (callback) callback({ error: 'Connecting to server. Please try again in a moment.' });
      return;
    }
    const cleanCode = (code || '').toUpperCase().trim();
    socket.emit('join_room', { code: cleanCode, nickname, token: myToken }, (res) => {
      if (res && res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
          if (res.isDuel) localStorage.setItem('ob_duelCode', cleanCode);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        if (res.isDuel && res.duelState) {
          setDuelState(res.duelState);
        }
        if (callback) callback(res);
      } else {
        // Fallback: Check if it is a duel code
        socket.emit('join_duel', { code: cleanCode, nickname, token: myToken }, (duelRes) => {
          if (duelRes && duelRes.success) {
            localStorage.setItem('ob_token', duelRes.token);
            localStorage.setItem('ob_playerId', duelRes.playerId);
            localStorage.setItem('ob_duelCode', cleanCode);
            setMyToken(duelRes.token);
            setMyPlayerId(duelRes.playerId);
            setDuelState(duelRes.duelState);
            if (callback) callback({ success: true, isDuel: true, roomCode: cleanCode, duelCode: cleanCode, duelState: duelRes.duelState });
          } else {
            if (callback) callback(res || duelRes || { error: 'Failed to join room' });
          }
        });
      }
    });
  };

  // MEDIUM-5: checkCode method for join flow
  const checkCode = useCallback((code, callback) => {
    if (!socket || !isConnected) {
      if (callback) callback({ type: 'none', error: 'Not connected' });
      return;
    }
    socket.emit('check_code', { code: code.toUpperCase() }, callback);
  }, [socket, isConnected]);

  // MEDIUM-5: retryConnection method for manual retry
  const retryConnection = useCallback(() => {
    if (socket) {
      setConnectionError(null);
      setServerWaking(true);
      socket.connect();
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      connectionError,
      serverWaking,
      clockOffset, // HIGH-3: Expose clock offset for countdown sync
      roomData,
      duelState,
      duelAudience,
      myPlayerId,
      createRoom,
      createDuel,
      joinDuel,
      joinRoom,
      checkCode, // MEDIUM-5: New method
      retryConnection, // MEDIUM-5: New method
      setRoomData,
      setDuelState,
    }}>
      {children}
    </SocketContext.Provider>
  );
};
