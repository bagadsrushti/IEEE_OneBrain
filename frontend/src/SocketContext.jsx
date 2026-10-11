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
    const payload = typeof opts === 'object' ? opts : { nickname: opts };
    socket.emit('create_room', payload, (res) => {
      if (res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
      }
      if (callback) callback(res);
    });
  };

  const createDuel = (opts, callback) => {
    const payload = typeof opts === 'object' ? opts : { nickname: opts };
    socket.emit('create_duel', payload, (res) => {
      if (res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        setDuelState(res.duelState);
      }
      if (callback) callback(res);
    });
  };

  const joinDuel = (code, nickname, callback) => {
    socket.emit('join_duel', { code, nickname, token: myToken }, (res) => {
      if (res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        setDuelState(res.duelState);
      }
      if (callback) callback(res);
    });
  };

  const joinRoom = (code, nickname, callback) => {
    socket.emit('join_room', { code, nickname, token: myToken }, (res) => {
      if (res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
        if (callback) callback(res);
      } else {
        // Fallback: Check if it is a duel code
        socket.emit('join_duel', { code, nickname, token: myToken }, (duelRes) => {
          if (duelRes.success) {
            localStorage.setItem('ob_token', duelRes.token);
            localStorage.setItem('ob_playerId', duelRes.playerId);
            setMyToken(duelRes.token);
            setMyPlayerId(duelRes.playerId);
            setDuelState(duelRes.duelState);
            if (callback) callback({ success: true, isDuel: true, roomCode: code });
          } else {
            if (callback) callback(res);
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
