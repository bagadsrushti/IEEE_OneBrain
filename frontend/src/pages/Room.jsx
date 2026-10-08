import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import Lobby from '../components/Lobby';
import Game from '../components/Game';

const Room = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { roomData, isConnected } = useSocket();

  useEffect(() => {
    if (isConnected && !roomData) {
      // Trying to access room directly without joining through context
      // The socket logic handles auto-reconnect if token is valid, but if not, redirect to landing
      const timer = setTimeout(() => {
        if (!roomData) navigate(`/join/${code}`);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, roomData, code, navigate]);

  if (!roomData) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-pulse text-blue-400 text-xl font-bold tracking-widest uppercase">
          Loading Data...
        </div>
      </div>
    );
  }

  const isLobby = roomData.state === 'lobby';

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4">
      {isLobby ? <Lobby room={roomData} /> : <Game room={roomData} />}
    </div>
  );
};

export default Room;
