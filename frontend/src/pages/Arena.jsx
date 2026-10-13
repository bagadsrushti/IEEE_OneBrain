import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import { getBackendUrl } from '../config';
import { Swords, Trophy, Users, Clock, ArrowRight, Eye, Plus, Server } from 'lucide-react';
import Button from '../components/Button';

const Arena = () => {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [arena, setArena] = useState({
    liveDuels: [],
    waitingDuels: [],
    winners: [],
    roomUsage: { active: 0, max: 100, remaining: 100 }
  });
  const [loading, setLoading] = useState(true);

  const backendUrl = getBackendUrl();

  const fetchArena = async () => {
    try {
      if (!backendUrl) return;
      const res = await fetch(`${backendUrl}/api/arena`);
      const data = await res.json();
      if (data.success) {
        setArena({
          liveDuels: data.liveDuels || [],
          waitingDuels: data.waitingDuels || [],
          winners: data.winners || [],
          roomUsage: data.roomUsage || { active: 0, max: 100, remaining: 100 }
        });
      }
    } catch (e) {
      console.error('Failed to load arena data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArena();
    const interval = setInterval(fetchArena, 3000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_arena', (res) => {
      if (res?.success && res.arenaData) {
        setArena(res.arenaData);
      }
    });

    const handleUpdate = (data) => {
      if (data) setArena(data);
    };

    socket.on('arena_update', handleUpdate);
    return () => {
      socket.off('arena_update', handleUpdate);
    };
  }, [socket]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-8 text-[#1E1B3A] animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-600 via-purple-600 to-blue-600 rounded-3xl p-6 sm:p-8 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-200">Live Projector Hub</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">One Brain Arena</h1>
          <p className="text-sm text-purple-100 mt-1 max-w-md">
            Simultaneous head-to-head duels. First team to solve 3 keywords takes the crown.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/"
            className="px-5 py-3 bg-white text-[#5046E5] hover:bg-purple-50 rounded-2xl font-bold text-sm flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Create New Duel</span>
          </Link>
        </div>
      </div>

      {/* Room Capacity Status */}
      {arena.roomUsage && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Server size={18} />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Global Server Capacity</span>
              <span className="text-sm font-black text-gray-900">
                {arena.roomUsage.active} / {arena.roomUsage.max} active game rooms in use
              </span>
            </div>
          </div>
          <div className="w-full sm:w-48 bg-gray-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                arena.roomUsage.active > 85 ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (arena.roomUsage.active / arena.roomUsage.max) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Section 1: Live Duels */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <Swords size={16} />
            </div>
            <h2 className="text-xl font-black">Live Duels in Progress ({arena.liveDuels.length})</h2>
          </div>
          {arena.liveDuels.length > 0 && (
            <span className="text-xs font-bold text-emerald-600 animate-pulse">● Races active</span>
          )}
        </div>

        {arena.liveDuels.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center text-gray-400">
            No duels currently active. Create one to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {arena.liveDuels.map((d) => {
              const mins = Math.floor(d.elapsedSeconds / 60);
              const secs = d.elapsedSeconds % 60;
              const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;

              return (
                <div
                  key={d.code}
                  className="bg-white border-2 border-gray-200 hover:border-indigo-300 rounded-3xl p-5 shadow-sm flex flex-col justify-between gap-4 transition-all group"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="font-mono text-sm font-black text-gray-800 tracking-wider">
                      #{d.code}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                      <Clock size={14} />
                      <span className="font-mono">{formattedTime}</span>
                    </div>
                  </div>

                  {/* Red vs Blue Score */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block truncate">
                        {d.teamRedName}
                      </span>
                      <div className="text-2xl font-black text-red-950 font-mono mt-1">
                        {d.teamRedSolved} <span className="text-xs text-red-400">/ 3</span>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block truncate">
                        {d.teamBlueName}
                      </span>
                      <div className="text-2xl font-black text-blue-950 font-mono mt-1">
                        {d.teamBlueSolved} <span className="text-xs text-blue-400">/ 3</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    to={`/duel/${d.code}`}
                    className="w-full py-2.5 bg-gray-50 hover:bg-indigo-50 border border-gray-200 group-hover:border-indigo-200 rounded-xl text-xs font-bold text-gray-700 group-hover:text-indigo-600 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Eye size={15} /> Spectate Live
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Waiting in Lobby */}
      {arena.waitingDuels.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <Users size={16} />
            </div>
            <h2 className="text-xl font-black">Duels Gathering Players ({arena.waitingDuels.length})</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {arena.waitingDuels.map((w) => (
              <div
                key={w.code}
                className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs"
              >
                <div>
                  <span className="font-mono text-base font-black text-gray-900 tracking-wider">
                    {w.code}
                  </span>
                  <div className="text-xs text-gray-500 font-medium">
                    {w.joinedCount ?? w.playerCount ?? 0} of {w.expectedPlayers || 8} joined
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/join/${w.code}`}
                    className="px-3 py-1.5 bg-[#5046E5] text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
                  >
                    Join
                  </Link>
                  <Link
                    to={`/duel/${w.code}`}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                    title="View Lobby"
                  >
                    <Eye size={16} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Hall of Champions / Winners */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
            <Trophy size={16} />
          </div>
          <h2 className="text-xl font-black">Hall of Champions</h2>
        </div>

        {arena.winners.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-6 text-center text-gray-400 text-xs">
            No completed duels yet. Matches will appear here when finished.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="divide-y divide-gray-100">
              {arena.winners.map((win, idx) => (
                <div
                  key={`${win.code}-${idx}`}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-gray-900">
                          {win.winningTeamName}
                        </span>
                        <span className="font-mono text-xs text-gray-400">
                          ({win.code})
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        vs {win.winner === 'red' ? win.teamBlueName : win.teamRedName} · {win.totalDurationSeconds}s match
                        {win.winningPlayers?.length > 0 && ` · [${win.winningPlayers.join(', ')}]`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">

                    <Link
                      to={`/duel/${win.code}`}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      Recap <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Arena;
