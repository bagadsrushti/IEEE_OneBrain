import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { getBackendUrl } from './config';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [myToken, setMyToken] = useState(localStorage.getItem('ob_token'));
  const [myPlayerId, setMyPlayerId] = useState(localStorage.getItem('ob_playerId'));

  const [duelState, setDuelState] = useState(null);
  const [duelAudience, setDuelAudience] = useState(null);

  useEffect(() => {
    // Determine backend URL
    const backendUrl = getBackendUrl();
    
    if (!backendUrl) {
      setConnectionError('Backend URL is not configured (VITE_SOCKET_URL)');
      return;
    }
    console.log('Resolved backend URL:', backendUrl);
    
    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
    });

    newSocket.on('connect_error', (err) => {
      setIsConnected(false);
      setConnectionError(`Connection error: ${err.message}`);
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

    newSocket.on('duel_started', (data) => {
      const myId = localStorage.getItem('ob_playerId');
      const token = localStorage.getItem('ob_token');
      const isRed = data.teamRedPlayerIds?.includes(myId);
      const isBlue = data.teamBluePlayerIds?.includes(myId);
      const targetRoom = isRed ? data.teamRedRoom : isBlue ? data.teamBlueRoom : null;

      if (targetRoom) {
        newSocket.emit('join_room', { code: targetRoom, token }, (res) => {
          if (res?.success) {
            console.log('Joined internal duel team room:', targetRoom);
          }
        });
      }
    });

    setSocket(newSocket);

    return () => newSocket.close();
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

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      connectionError,
      roomData,
      duelState,
      duelAudience,
      myPlayerId,
      createRoom,
      createDuel,
      joinDuel,
      joinRoom,
      setRoomData,
      setDuelState,
    }}>
      {children}
    </SocketContext.Provider>
  );
};
