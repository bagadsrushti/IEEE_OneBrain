import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { useSocket } from '../SocketContext';
import { Users, Shuffle, Play, Copy, Check, Swords, Shield, Award, Sparkles } from 'lucide-react';
import Button from './Button';

const DuelLobby = ({ duel, onDuelStarted }) => {
  const { socket, myPlayerId } = useSocket();
  const [copied, setCopied] = useState(false);
  const [redName, setRedName] = useState(duel.teamRed?.name || 'Team Red');
  const [blueName, setBlueName] = useState(duel.teamBlue?.name || 'Team Blue');
  const [editingNames, setEditingNames] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isHost = duel.hostId === myPlayerId;
  const totalPlayers = duel.players?.length || 0;
  const redCount = duel.teamRed?.playerCount || duel.teamRed?.playerIds?.length || 0;
  const blueCount = duel.teamBlue?.playerCount || duel.teamBlue?.playerIds?.length || 0;
  const hasSplit = redCount >= 2 && blueCount >= 2;
  const canStart = hasSplit && totalPlayers >= 4 && totalPlayers <= 16 && Math.abs(redCount - blueCount) <= 1;

  const joinUrl = `${window.location.origin}/join/${duel.code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSplit = () => {
    setError('');
    setLoading(true);
    socket.emit('split_duel_teams', { code: duel.code }, (res) => {
      setLoading(false);
      if (res?.error) setError(res.error);
    });
  };

  const handleShuffle = () => {
    setError('');
    setLoading(true);
    socket.emit('shuffle_duel_teams', { code: duel.code }, (res) => {
      setLoading(false);
      if (res?.error) setError(res.error);
    });
  };

  const handleSaveNames = () => {
    setError('');
    socket.emit('rename_duel_teams', {
      code: duel.code,
      teamRedName: redName,
      teamBlueName: blueName,
    }, (res) => {
      if (res?.error) setError(res.error);
      else setEditingNames(false);
    });
  };

  const handleStart = () => {
    setError('');
    setLoading(true);
    socket.emit('start_duel', { code: duel.code }, (res) => {
      setLoading(false);
      if (res?.error) setError(res.error);
    });
  };

  const redPlayers = duel.players?.filter(p => p.team === 'red') || [];
  const bluePlayers = duel.players?.filter(p => p.team === 'blue') || [];
  const unassigned = duel.players?.filter(p => !p.team) || [];

  return (
    <div className="w-full max-w-[500px] flex flex-col gap-5 text-[#1E1B3A] pb-8 animate-fade-in">
      {/* Header Badge */}
      <div className="bg-gradient-to-r from-red-500/10 via-purple-500/10 to-blue-500/10 border border-[#E5E7EB] rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Swords size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6366F1]">Head-to-Head</span>
            <h2 className="text-[17px] font-black text-[#1E1B3A] leading-tight">Duel Mode Lobby</h2>
          </div>
        </div>
        <span className="text-[12px] font-bold px-3 py-1 bg-white border border-[#E5E7EB] rounded-full text-[#4B5563] shadow-2xs">
          4 to 16 players
        </span>
      </div>

      {/* Code & QR Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col items-center gap-3">
        <span className="text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Duel Code</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-black text-[#1E1B3A] tracking-widest">{duel.code}</span>
          <button
            onClick={copyLink}
            className="p-2 border border-[#E5E7EB] hover:bg-[#F9FAFB] rounded-lg text-[#6B7280] transition-colors"
            title="Copy join link"
          >
            {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
          </button>
        </div>

        <div className="p-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl my-1">
          <QRCode value={joinUrl} size={110} />
        </div>

        <p className="text-[12px] text-[#6B7280] text-center">
          Ask all players to join using code <strong className="text-[#1E1B3A]">{duel.code}</strong>.
          <br /><span className="text-indigo-600 font-semibold">Recommended: even number of players (e.g. 4, 6, 8, 10)</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Team Cards (Red vs Blue) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Team Red */}
        <div className="bg-red-50/50 border-2 border-red-200 rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-red-600 tracking-wider">Red Team</span>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
              {redPlayers.length} players
            </span>
          </div>

          {editingNames ? (
            <input
              type="text"
              value={redName}
              onChange={(e) => setRedName(e.target.value)}
              className="text-xs font-bold p-1 bg-white border border-red-200 rounded"
              maxLength={20}
            />
          ) : (
            <h3 className="font-extrabold text-[15px] text-red-950 truncate">{duel.teamRed?.name || 'Team Red'}</h3>
          )}

          <div className="flex flex-col gap-1 min-h-[70px]">
            {redPlayers.length === 0 ? (
              <span className="text-[11px] text-gray-400 italic py-4 text-center">No players assigned</span>
            ) : (
              redPlayers.map(p => (
                <div key={p.id} className="text-[12px] bg-white border border-red-100 rounded-lg px-2 py-1 font-medium text-red-950 flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  {p.id === myPlayerId && <span className="text-[10px] text-red-600 font-bold ml-1">(You)</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Blue */}
        <div className="bg-blue-50/50 border-2 border-blue-200 rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-blue-600 tracking-wider">Blue Team</span>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              {bluePlayers.length} players
            </span>
          </div>

          {editingNames ? (
            <input
              type="text"
              value={blueName}
              onChange={(e) => setBlueName(e.target.value)}
              className="text-xs font-bold p-1 bg-white border border-blue-200 rounded"
              maxLength={20}
            />
          ) : (
            <h3 className="font-extrabold text-[15px] text-blue-950 truncate">{duel.teamBlue?.name || 'Team Blue'}</h3>
          )}

          <div className="flex flex-col gap-1 min-h-[70px]">
            {bluePlayers.length === 0 ? (
              <span className="text-[11px] text-gray-400 italic py-4 text-center">No players assigned</span>
            ) : (
              bluePlayers.map(p => (
                <div key={p.id} className="text-[12px] bg-white border border-blue-100 rounded-lg px-2 py-1 font-medium text-blue-950 flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  {p.id === myPlayerId && <span className="text-[10px] text-blue-600 font-bold ml-1">(You)</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Unassigned Players list */}
      {unassigned.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 block">
            Waiting in Lobby ({unassigned.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(p => (
              <span key={p.id} className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-700">
                {p.name} {p.id === myPlayerId ? '(You)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Host Controls */}
      {isHost ? (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {!hasSplit ? (
              <Button
                variant="secondary"
                onClick={handleSplit}
                disabled={loading || totalPlayers < 4}
                className="w-full flex items-center justify-center gap-2"
              >
                <Users size={16} /> Split into teams
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={handleShuffle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2"
              >
                <Shuffle size={16} /> Shuffle again
              </Button>
            )}

            {editingNames ? (
              <Button variant="secondary" onClick={handleSaveNames} className="w-full">
                Save Names
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setEditingNames(true)} className="w-full">
                Rename Teams
              </Button>
            )}
          </div>

          <Button
            variant="primary"
            onClick={handleStart}
            disabled={loading || !canStart}
            className="w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-md"
          >
            <Play size={18} fill="currentColor" />
            {canStart ? 'Start Duel Race' : totalPlayers < 4 ? 'Need at least 4 players' : 'Split teams to start'}
          </Button>
        </div>
      ) : (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-center text-xs text-indigo-900 font-medium">
          Waiting for host to split teams and launch the race...
        </div>
      )}
    </div>
  );
};

export default DuelLobby;
