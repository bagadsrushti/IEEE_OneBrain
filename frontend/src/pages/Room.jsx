import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import Lobby from '../components/Lobby';
import DuelLobby from '../components/DuelLobby';
import Game from '../components/Game';

const Room = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { roomData, duelState, isConnected } = useSocket();

  useEffect(() => {
    if (isConnected && !roomData && (!duelState || duelState.code !== code)) {
      // Trying to access room directly without joining through context
      const timer = setTimeout(() => {
        if (!roomData && (!duelState || duelState.code !== code)) navigate(`/join/${code}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, roomData, duelState, code, navigate]);

  if (duelState && duelState.code === code && duelState.status === 'lobby') {
    return (
      <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
        <DuelLobby duel={duelState} />
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl font-bold tracking-widest uppercase">
          Loading Data...
        </div>
      </div>
    );
  }

  const isLobby = roomData.state === 'lobby';

  return (
    <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
      {isLobby ? <Lobby room={roomData} /> : <Game room={roomData} />}
    </div>
  );
};

export default Room;
