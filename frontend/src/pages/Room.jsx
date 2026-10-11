import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import Lobby from '../components/Lobby';
import DuelLobby from '../components/DuelLobby';
import Game from '../components/Game';

const Room = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { roomData, duelState, isConnected, socket, setDuelState } = useSocket();
  const upperCode = (code || '').toUpperCase();

  useEffect(() => {
    if (!isConnected || !socket) return;

    const hasMatchingRoom = roomData && roomData.id?.toUpperCase() === upperCode;
    const hasMatchingDuel = duelState && duelState.code?.toUpperCase() === upperCode;

    if (hasMatchingRoom || hasMatchingDuel) return;

    const token = localStorage.getItem('ob_token');
    socket.emit('get_duel_state', { code: upperCode, token }, (res) => {
      if (res?.success && res.duelState) {
        setDuelState(res.duelState);
      } else {
        const timer = setTimeout(() => {
          navigate(`/join/${upperCode}`);
        }, 2000);
        return () => clearTimeout(timer);
      }
    });
  }, [isConnected, socket, roomData, duelState, upperCode, navigate, setDuelState]);

  if (duelState && duelState.code?.toUpperCase() === upperCode && (duelState.status === 'lobby' || duelState.status === 'countdown' || duelState.status === 'team_reveal')) {
    return (
      <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
        <DuelLobby duel={duelState} />
      </div>
    );
  }

  if (!roomData && (!duelState || duelState.code?.toUpperCase() !== upperCode)) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl font-bold tracking-widest uppercase">
          Loading Data...
        </div>
      </div>
    );
  }

  const isLobby = roomData?.state === 'lobby';

  return (
    <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
      {isLobby ? <Lobby room={roomData} /> : <Game room={roomData} />}
    </div>
  );
};

export default Room;
