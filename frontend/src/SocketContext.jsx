import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [myToken, setMyToken] = useState(localStorage.getItem('ob_token'));
  const [myPlayerId, setMyPlayerId] = useState(localStorage.getItem('ob_playerId'));

  useEffect(() => {
    // Determine backend URL (use current host for prod, but force port 3001 in dev)
    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : window.location.origin);
    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('room_update', (data) => {
      setRoomData(data);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const createRoom = (nickname, callback) => {
    socket.emit('create_room', { nickname }, (res) => {
      if (res.success) {
        localStorage.setItem('ob_token', res.token);
        localStorage.setItem('ob_playerId', res.playerId);
        setMyToken(res.token);
        setMyPlayerId(res.playerId);
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
      }
      if (callback) callback(res);
    });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      roomData,
      myPlayerId,
      createRoom,
      joinRoom,
      setRoomData
    }}>
      {children}
    </SocketContext.Provider>
  );
};
