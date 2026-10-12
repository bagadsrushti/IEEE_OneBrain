import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useSocket } from '../SocketContext';
import { getBackendUrl } from '../config';
import { Swords, Trophy, Clock, Check, Sparkles, Award, ArrowLeft, Shield } from 'lucide-react';

const DuelAudience = () => {
  const { code } = useParams();
  const { socket } = useSocket();
  const [duel, setDuel] = useState(null);
  const [error, setError] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('00:00');

  const backendUrl = getBackendUrl();

  // Fetch initial state via REST
  useEffect(() => {
    const fetchDuel = async () => {
      try {
        if (!backendUrl) return;
        const res = await fetch(`${backendUrl}/api/duel/${code}`);
        const data = await res.json();
        if (data.success && data.audience) {
          setDuel(data.audience);
        } else {
          setError(data.error || 'Duel not found');
        }
      } catch (err) {
        setError('Failed to load duel data');
      }
    };

    fetchDuel();
    const interval = setInterval(fetchDuel, 2000);
    return () => clearInterval(interval);
  }, [code, backendUrl]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket || !code) return;

    socket.emit('join_duel_audience', { code }, (res) => {
      if (res?.success && res.audienceState) {
        setDuel(res.audienceState);
      }
    });

    const handleUpdate = (updatedState) => {
      if (updatedState && updatedState.code === code.toUpperCase()) {
        setDuel(updatedState);
      }
    };

    socket.on('duel_update', handleUpdate);
    return () => {
      socket.off('duel_update', handleUpdate);
    };
  }, [socket, code]);

  // Match clock
  useEffect(() => {
    if (!duel) return;

    const interval = setInterval(() => {
      if (duel.status === 'in_progress') {
        const totalSec = duel.elapsedSeconds || 0;
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        setTimerDisplay(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duel]);

  // Confetti on win
  useEffect(() => {
    if (duel?.status === 'finished' && duel.winner && duel.winner !== 'draw') {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.5 },
        colors: duel.winner === 'red' ? ['#DC2626', '#F87171', '#FEF2F2'] : ['#2563EB', '#60A5FA', '#EFF6FF']
      });
    }
  }, [duel?.status, duel?.winner]);

  if (error) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
          <Swords size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[#1E1B3A] mb-2">{error}</h2>
        <p className="text-gray-500 mb-6">Check the duel code and try again.</p>
        <Link to="/arena" className="px-5 py-2.5 bg-[#5046E5] text-white rounded-xl font-bold text-sm">
          Go to Arena
        </Link>
      </div>
    );
  }

  if (!duel) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="animate-pulse text-[#5046E5] text-lg font-bold">
          Loading Live Spectator View...
        </div>
      </div>
    );
  }

  const isFinished = duel.status === 'finished';
  const isLobby = duel.status === 'lobby';
  const redSolved = duel.teamRed?.solvedCount || 0;
  const blueSolved = duel.teamBlue?.solvedCount || 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6 animate-fade-in text-[#1E1B3A]">
      {/* Top Bar with Navigation & Match Timer */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <Link
          to="/arena"
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#5046E5] transition-colors"
        >
          <ArrowLeft size={16} /> All Duels Arena
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Duel Code</span>
          <span className="font-mono text-lg font-black bg-gray-100 px-3 py-1 rounded-lg tracking-widest">
            {duel.code}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-400" />
          <span className="font-mono text-sm font-bold text-gray-700">
            {isLobby ? 'Waiting' : isFinished ? 'Final' : timerDisplay}
          </span>
          <span className={`w-2 h-2 rounded-full ${isFinished ? 'bg-gray-400' : isLobby ? 'bg-amber-400' : 'bg-emerald-500 animate-ping'}`} />
        </div>
      </div>

      {/* Winner Hero Banner if Finished */}
      {isFinished && (
        <div className="w-full bg-gradient-to-r from-amber-50 via-yellow-100 to-amber-50 border-2 border-yellow-300 rounded-3xl p-6 shadow-md text-center flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 text-white flex items-center justify-center shadow-sm">
            <Trophy size={36} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-amber-800">
              Duel Concluded · {duel.winnerReason === 'first_to_3' ? 'First to 3 Solves' : 'Match Decided'}
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-amber-950 mt-1">
              🏆 {duel.winningTeamName} Wins!
            </h1>
          </div>

          <div className="px-5 py-2 bg-white/90 border border-amber-200 rounded-2xl text-base font-extrabold text-amber-900 shadow-2xs">
            {duel.prizeBanner}
          </div>

          {duel.winningPlayers && duel.winningPlayers.length > 0 && (
            <div className="text-xs text-amber-800 mt-1 font-medium">
              Winning Members: <strong>{duel.winningPlayers.join(', ')}</strong>
            </div>
          )}

          {duel.chocolateAwarded && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-full text-xs font-bold">
              <Check size={14} /> 🍫 Chocolate Awarded!
            </span>
          )}
        </div>
      )}

      {/* Team Reveal Banner */}
      {duel.status === 'team_reveal' && (
        <div className="w-full bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 rounded-3xl p-6 text-white text-center shadow-md animate-pulse space-y-2">
          <div className="text-xs font-black uppercase tracking-widest text-indigo-200">
            ⚔️ Match Starting Soon
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">Team Distribution</h2>
          <p className="text-sm text-indigo-100 max-w-md mx-auto">
            Teams have been divided! Players are reviewing clues and getting ready.
          </p>
        </div>
      )}

      {/* Spectator Match Grid: Team Red vs Team Blue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TEAM RED */}
        <div className={`bg-white rounded-3xl border-3 p-6 flex flex-col gap-5 shadow-sm transition-all ${
          duel.winner === 'red' ? 'border-red-500 ring-4 ring-red-100' : 'border-red-200'
        }`}>
          <div className="flex items-center justify-between border-b border-red-100 pb-3">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-red-600">Red Team</span>
              <h2 className="text-2xl font-black text-red-950 truncate max-w-[220px]">
                {duel.teamRed?.name || 'Team Red'}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black font-mono text-red-600">{redSolved}</span>
              <span className="text-sm font-bold text-red-400"> / 3</span>
            </div>
          </div>

          {/* 3 Goal Lights */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Race Progress</span>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((idx) => {
                const isSolved = redSolved > idx;
                const isCurrent = redSolved === idx && !isFinished && !isLobby;
                return (
                  <div
                    key={idx}
                    className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                      isSolved
                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                        : isCurrent
                        ? 'bg-red-50 border-red-400 text-red-600 animate-pulse ring-2 ring-red-200'
                        : 'bg-gray-50 border-gray-200 text-gray-300'
                    }`}
                  >
                    {isSolved ? (
                      <Check size={26} strokeWidth={3} />
                    ) : (
                      <span className="font-mono text-lg font-black">{idx + 1}</span>
                    )}
                    <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-90">
                      {isSolved ? 'Solved' : isCurrent ? 'Active' : 'Goal'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Members Roster */}
          {duel.teamRed?.players && duel.teamRed.players.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-red-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Team Members ({duel.teamRed.players.length})</span>
              <div className="flex flex-wrap gap-1.5">
                {duel.teamRed.players.map((name, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200/60 rounded-lg text-xs font-bold">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {duel.teamRed?.inReveal && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center text-xs font-bold text-red-700 animate-pulse">
              Keyword reveal in progress...
            </div>
          )}
        </div>

        {/* TEAM BLUE */}
        <div className={`bg-white rounded-3xl border-3 p-6 flex flex-col gap-5 shadow-sm transition-all ${
          duel.winner === 'blue' ? 'border-blue-500 ring-4 ring-blue-100' : 'border-blue-200'
        }`}>
          <div className="flex items-center justify-between border-b border-blue-100 pb-3">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600">Blue Team</span>
              <h2 className="text-2xl font-black text-blue-950 truncate max-w-[220px]">
                {duel.teamBlue?.name || 'Team Blue'}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black font-mono text-blue-600">{blueSolved}</span>
              <span className="text-sm font-bold text-blue-400"> / 3</span>
            </div>
          </div>

          {/* 3 Goal Lights */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Race Progress</span>
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((idx) => {
                const isSolved = blueSolved > idx;
                const isCurrent = blueSolved === idx && !isFinished && !isLobby;
                return (
                  <div
                    key={idx}
                    className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                      isSolved
                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                        : isCurrent
                        ? 'bg-blue-50 border-blue-400 text-blue-600 animate-pulse ring-2 ring-blue-200'
                        : 'bg-gray-50 border-gray-200 text-gray-300'
                    }`}
                  >
                    {isSolved ? (
                      <Check size={26} strokeWidth={3} />
                    ) : (
                      <span className="font-mono text-lg font-black">{idx + 1}</span>
                    )}
                    <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-90">
                      {isSolved ? 'Solved' : isCurrent ? 'Active' : 'Goal'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Members Roster */}
          {duel.teamBlue?.players && duel.teamBlue.players.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-blue-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Team Members ({duel.teamBlue.players.length})</span>
              <div className="flex flex-wrap gap-1.5">
                {duel.teamBlue.players.map((name, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200/60 rounded-lg text-xs font-bold">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {duel.teamBlue?.inReveal && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center text-xs font-bold text-blue-700 animate-pulse">
              Keyword reveal in progress...
            </div>
          )}
        </div>
      </div>

      {/* Rules & Integrity Reminder */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-0.5">
          First team to solve 3 keywords wins the duel.
        </p>
        <span>
          Both teams receive the same pool in balanced offset orders. No clues or keywords are disclosed on spectator screens.
        </span>
      </div>
    </div>
  );
};

export default DuelAudience;
