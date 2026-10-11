import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import Lobby from '../components/Lobby';
import DuelLobby from '../components/DuelLobby';
import Game from '../components/Game';
import { Swords, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';

const Room = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { roomData, duelState, isConnected, socket, setDuelState } = useSocket();
  const upperCode = (code || '').toUpperCase();
  const [notFound, setNotFound] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Use passed duel state from navigation if available
  useEffect(() => {
    if (location.state?.duel && (!duelState || duelState.code?.toUpperCase() !== upperCode)) {
      setDuelState(location.state.duel);
    }
  }, [location.state, duelState, upperCode, setDuelState]);

  useEffect(() => {
    if (!isConnected || !socket) return;

    const hasMatchingRoom = roomData && (roomData.id?.toUpperCase() === upperCode || roomData.duelCode?.toUpperCase() === upperCode);
    const hasMatchingDuel = duelState && duelState.code?.toUpperCase() === upperCode;

    if (hasMatchingRoom || hasMatchingDuel) {
      setNotFound(false);
      return;
    }

    setFetching(true);
    const token = localStorage.getItem('ob_token');

    // 1. First check if it's a duel
    socket.emit('get_duel_state', { code: upperCode, token }, (duelRes) => {
      setFetching(false);
      if (duelRes?.success && duelRes.duelState) {
        setDuelState(duelRes.duelState);
        setNotFound(false);

        // If the player isn't in this duel yet, redirect to /join so they can enter a nickname
        const myId = localStorage.getItem('ob_playerId');
        const isJoined = duelRes.duelState.players?.some(p => p.id === myId || p.token === token);
        if (!isJoined && duelRes.duelState.status === 'lobby') {
          navigate(`/join/${upperCode}`);
        }
      } else {
        // 2. If not a duel, wait briefly for room_update from standard room
        const timer = setTimeout(() => {
          const currentRoom = roomData && (roomData.id?.toUpperCase() === upperCode || roomData.duelCode?.toUpperCase() === upperCode);
          if (!currentRoom) {
            setNotFound(true);
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    });
  }, [isConnected, socket, roomData, duelState, upperCode, navigate, setDuelState]);

  // View: Duel Lobby (Waiting queue, Countdown, or Meet your team)
  if (duelState && duelState.code?.toUpperCase() === upperCode && (duelState.status === 'lobby' || duelState.status === 'countdown' || duelState.status === 'team_reveal')) {
    return (
      <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
        <DuelLobby duel={duelState} />
      </div>
    );
  }

  // View: Duel Finished Screen
  if (duelState && duelState.code?.toUpperCase() === upperCode && duelState.status === 'finished') {
    const activeRoomData = roomData || {
      mode: 'duel_team',
      duelCode: upperCode,
      duelInfo: duelState,
      state: 'finished',
    };
    return (
      <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
        <Game room={activeRoomData} />
      </div>
    );
  }

  // View: Duel Match in progress
  if (duelState && duelState.code?.toUpperCase() === upperCode && duelState.status === 'in_progress') {
    if (roomData) {
      return (
        <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
          <Game room={roomData} />
        </div>
      );
    }
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-[#5046E5] flex items-center justify-center animate-bounce shadow-xs">
          <Swords size={28} />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#1E1B3A]">Connecting to Arena...</h2>
          <p className="text-sm text-[#6B7280] mt-1">Preparing your team clues and keywords</p>
        </div>
      </div>
    );
  }

  // View: Standard Room Match or Lobby
  if (roomData && (roomData.id?.toUpperCase() === upperCode || roomData.duelCode?.toUpperCase() === upperCode)) {
    const isLobby = roomData.state === 'lobby';
    return (
      <div className="flex-grow flex flex-col items-center w-full px-2 py-1">
        {isLobby ? <Lobby room={roomData} /> : <Game room={roomData} />}
      </div>
    );
  }

  // View: Room Not Found
  if (notFound) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-[380px] mx-auto animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-xs">
          <AlertCircle size={30} />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-[#1E1B3A]">Room Not Found</h2>
          <p className="text-sm text-[#6B7280]">
            We could not find room <span className="font-mono font-bold text-[#1E1B3A]">{upperCode}</span>. It may have expired or ended.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2 w-full">
          <Link
            to={`/join/${upperCode}`}
            className="w-full py-3 bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold rounded-xl text-sm transition-colors text-center shadow-xs"
          >
            Try Joining With Nickname
          </Link>
          <Link
            to="/"
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-[#4B5563] font-bold rounded-xl text-sm transition-colors text-center"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Loading indicator
  return (
    <div className="flex-grow flex flex-col items-center justify-center space-y-3">
      <div className="w-10 h-10 border-3 border-[#5046E5]/20 border-t-[#5046E5] rounded-full animate-spin"></div>
      <div className="text-sm font-bold text-[#5046E5] uppercase tracking-widest">
        {fetching ? 'Checking Room...' : 'Loading Room...'}
      </div>
    </div>
  );
};

export default Room;
