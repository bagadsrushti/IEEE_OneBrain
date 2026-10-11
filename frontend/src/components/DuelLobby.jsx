import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useSocket } from '../SocketContext';
import {
  Users,
  Play,
  Copy,
  Check,
  Swords,
  Trash2,
  Tv,
  Clock,
  Sparkles,
  Shield,
  Edit2,
  AlertCircle
} from 'lucide-react';
import Button from './Button';

const ALLOWED_COUNTS = [4, 6, 8, 10, 12, 14, 16];

const DuelLobby = ({ duel }) => {
  const { socket, myPlayerId } = useSocket();
  const [copied, setCopied] = useState(false);
  const [redName, setRedName] = useState(duel.teamRed?.name || 'Team Red');
  const [blueName, setBlueName] = useState(duel.teamBlue?.name || 'Team Blue');
  const [editingNames, setEditingNames] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync team names if changed externally
  useEffect(() => {
    if (duel.teamRed?.name) setRedName(duel.teamRed.name);
    if (duel.teamBlue?.name) setBlueName(duel.teamBlue.name);
  }, [duel.teamRed?.name, duel.teamBlue?.name]);

  // Timers for countdown & meet-team reveal
  const [countdownSec, setCountdownSec] = useState(5);
  const [meetTeamSec, setMeetTeamSec] = useState(10);

  useEffect(() => {
    let interval;
    if (duel.status === 'countdown') {
      setCountdownSec(5);
      interval = setInterval(() => {
        setCountdownSec((prev) => (prev > 1 ? prev - 1 : 1));
      }, 1000);
    } else if (duel.status === 'team_reveal') {
      const remaining = duel.teamRevealEndTime
        ? Math.max(1, Math.round((duel.teamRevealEndTime - Date.now()) / 1000))
        : 10;
      setMeetTeamSec(remaining);
      interval = setInterval(() => {
        setMeetTeamSec((prev) => (prev > 1 ? prev - 1 : 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [duel.status, duel.teamRevealEndTime]);

  const isHost = duel.hostId === myPlayerId;
  const players = duel.players || [];
  const joinedCount = players.length;
  const expectedPlayers = duel.expectedPlayers || 8;
  const isOdd = joinedCount % 2 !== 0;
  const canStartNow = !isOdd && joinedCount >= 4 && (duel.status === 'lobby' || duel.status === 'countdown');

  const joinUrl = `${window.location.origin}/join/${duel.code}`;
  const bigScreenUrl = `/duel/${duel.code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemovePlayer = (playerId) => {
    setError('');
    socket.emit('remove_duel_player', { code: duel.code, playerId }, (res) => {
      if (res?.error) setError(res.error);
    });
  };

  const handleSetExpected = (newN) => {
    setError('');
    socket.emit('set_duel_expected_players', { code: duel.code, expectedPlayers: newN }, (res) => {
      if (res?.error) setError(res.error);
    });
  };

  const handleStartNow = () => {
    if (!canStartNow) return;
    setError('');
    setLoading(true);
    socket.emit('start_duel_now', { code: duel.code }, (res) => {
      setLoading(false);
      if (res?.error) setError(res.error);
    });
  };

  const handleSaveTeamNames = () => {
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

  // =========================================================================
  // VIEW: "MEET YOUR TEAM" (10-second reveal screen)
  // =========================================================================
  if (duel.status === 'team_reveal') {
    const myPlayer = players.find(p => p.id === myPlayerId);
    const myTeamKey = myPlayer?.team || (duel.teamRed?.playerIds?.includes(myPlayerId) ? 'red' : 'blue');
    const isRed = myTeamKey === 'red';

    const redPlayers = players.filter(p => duel.teamRed?.playerIds?.includes(p.id) || p.team === 'red');
    const bluePlayers = players.filter(p => duel.teamBlue?.playerIds?.includes(p.id) || p.team === 'blue');
    const myTeammates = isRed ? redPlayers : bluePlayers;
    const opponentPlayers = isRed ? bluePlayers : redPlayers;
    const myTeamName = isRed ? (duel.teamRed?.name || 'Team Red') : (duel.teamBlue?.name || 'Team Blue');
    const oppTeamName = isRed ? (duel.teamBlue?.name || 'Team Blue') : (duel.teamRed?.name || 'Team Red');

    return (
      <div className="w-full max-w-[540px] flex flex-col items-center gap-6 text-[#1E1B3A] pb-8 animate-fade-in text-center">
        {/* Countdown Pill */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-indigo-600 text-white rounded-full font-black text-sm shadow-md animate-pulse">
          <Clock size={16} />
          <span>Starting in {meetTeamSec}s...</span>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <span className="text-xs font-black uppercase tracking-widest text-[#6366F1]">Duel Arena</span>
          <h2 className="text-3xl font-black text-[#1E1B3A]">Meet Your Team!</h2>
          <p className="text-sm text-gray-500 max-w-[360px] mx-auto">
            You hold different clues from your teammates. Talk, collaborate, and submit ONE team answer!
          </p>
        </div>

        {/* Your Team Card */}
        <div className={`w-full rounded-2xl p-5 border-2 shadow-sm ${
          isRed
            ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-300 text-red-950'
            : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300 text-blue-950'
        }`}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-black/10">
            <div className="flex items-center gap-2 text-left">
              <Shield size={20} className={isRed ? 'text-red-600' : 'text-blue-600'} />
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider block opacity-75">Your Squad</span>
                <h3 className="text-xl font-black">{myTeamName}</h3>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
              isRed ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'
            }`}>
              {myTeammates.length} Players
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left">
            {myTeammates.map(p => (
              <div
                key={p.id}
                className={`p-2.5 bg-white rounded-xl border font-bold text-sm flex items-center justify-between ${
                  p.id === myPlayerId
                    ? (isRed ? 'border-red-400 ring-2 ring-red-300' : 'border-blue-400 ring-2 ring-blue-300')
                    : 'border-black/5'
                }`}
              >
                <span className="truncate">{p.name}</span>
                {p.id === myPlayerId && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                    isRed ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    YOU
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Opponent Card */}
        <div className="w-full bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Opponent Team</span>
            <span className="text-xs font-bold text-gray-600">{oppTeamName} ({opponentPlayers.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {opponentPlayers.map(p => (
              <span key={p.id} className="text-xs font-semibold px-2.5 py-1 bg-gray-100 rounded-lg text-gray-700">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: WAITING QUEUE (status 'lobby' or 'countdown')
  // =========================================================================
  const progressPercent = Math.min(100, Math.round((joinedCount / expectedPlayers) * 100));

  return (
    <div className="w-full max-w-[500px] flex flex-col gap-5 text-[#1E1B3A] pb-8 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/10 via-purple-500/10 to-blue-500/10 border border-[#E5E7EB] rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Swords size={20} strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6366F1]">Duel Mode</span>
            <h2 className="text-[17px] font-black text-[#1E1B3A] leading-tight">Waiting Queue</h2>
          </div>
        </div>
        <Link
          to={bigScreenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E7EB] hover:border-indigo-400 rounded-full text-xs font-bold text-[#5046E5] shadow-2xs transition-colors"
          title="Open Big Screen Projector View"
        >
          <Tv size={14} />
          <span>Big Screen</span>
        </Link>
      </div>

      {/* Progress & Queue Count Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Player Queue</span>
          <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
            {expectedPlayers / 2}v{expectedPlayers / 2} Duel
          </span>
        </div>

        <div className="text-center py-1">
          <div className="text-3xl font-black text-[#1E1B3A] tracking-tight">
            {joinedCount} of {expectedPlayers} players joined
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {joinedCount === expectedPlayers
              ? 'Queue full! Dividing teams shortly...'
              : `Waiting for ${expectedPlayers - joinedCount} more player${expectedPlayers - joinedCount === 1 ? '' : 's'}...`}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-red-500 via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {/* Countdown Banner if N players joined */}
        {duel.status === 'countdown' && (
          <div className="mt-2 p-3 bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-xl flex items-center justify-between font-bold text-sm shadow-sm animate-pulse">
            <span className="flex items-center gap-2">
              <Sparkles size={18} />
              Dividing into teams...
            </span>
            <span className="text-lg font-black">{countdownSec}s</span>
          </div>
        )}

        {/* Odd Count Warning when host wants to start early */}
        {isOdd && joinedCount >= 3 && (
          <div className="mt-1 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-center gap-2 text-xs font-medium">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>Waiting for 1 more player (or remove one) for equal teams.</span>
          </div>
        )}
      </div>

      {/* Code & QR Box */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs flex flex-col items-center gap-3">
        <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Duel Code</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-black text-[#1E1B3A] tracking-widest">{duel.code}</span>
          <button
            onClick={copyLink}
            className="p-2 border border-[#E5E7EB] hover:bg-[#F9FAFB] rounded-lg text-[#6B7280] transition-colors cursor-pointer"
            title="Copy join link"
          >
            {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
          </button>
        </div>

        <div className="p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl">
          <QRCode value={joinUrl} size={100} />
        </div>

        <span className="text-[11px] text-gray-500 text-center">
          Share the code or scan QR code to join this duel.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Live Players List */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs flex flex-col gap-2.5">
        <div className="flex items-center justify-between pb-1 border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Joined Players ({joinedCount})
          </span>
          {isHost && (
            <span className="text-[11px] text-gray-400">Host can remove players</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-1">
          {players.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-[11px] font-bold text-gray-400">{idx + 1}.</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-bold text-sm text-[#1E1B3A] truncate">{p.name}</span>
                {p.id === duel.hostId && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    HOST
                  </span>
                )}
                {p.id === myPlayerId && p.id !== duel.hostId && (
                  <span className="text-[10px] font-bold text-gray-400">(You)</span>
                )}
              </div>

              {isHost && p.id !== duel.hostId && (
                <button
                  type="button"
                  onClick={() => handleRemovePlayer(p.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title={`Remove ${p.name}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Host Controls: Adjust N & Rename Teams & Start Now */}
      {isHost ? (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs flex flex-col gap-4">
          {/* Adjust Player Count (N) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-600 flex items-center justify-between">
              <span>Change Target Player Count:</span>
              <span className="text-indigo-600 font-extrabold">{expectedPlayers} Players</span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
              {ALLOWED_COUNTS.map((num) => {
                const disabled = num < joinedCount;
                return (
                  <button
                    key={num}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSetExpected(num)}
                    className={`py-1.5 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                      expectedPlayers === num
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                        : disabled
                        ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                    }`}
                    title={disabled ? `Cannot lower below joined (${joinedCount})` : `Set to ${num}`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rename Teams */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">Team Names (Optional)</span>
              {!editingNames ? (
                <button
                  type="button"
                  onClick={() => setEditingNames(true)}
                  className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 size={12} /> Rename
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveTeamNames}
                  className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                >
                  Save Names
                </button>
              )}
            </div>

            {editingNames && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-red-600 uppercase">Red Team</label>
                  <input
                    type="text"
                    value={redName}
                    onChange={(e) => setRedName(e.target.value.slice(0, 20))}
                    maxLength={20}
                    className="w-full text-xs font-bold p-2 border border-red-200 rounded-lg focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase">Blue Team</label>
                  <input
                    type="text"
                    value={blueName}
                    onChange={(e) => setBlueName(e.target.value.slice(0, 20))}
                    maxLength={20}
                    className="w-full text-xs font-bold p-2 border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Start Now Button */}
          <Button
            variant="primary"
            onClick={handleStartNow}
            disabled={loading || !canStartNow}
            className="w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Play size={18} fill="currentColor" />
            {canStartNow
              ? `Start now with ${joinedCount} players (${joinedCount / 2}v${joinedCount / 2})`
              : isOdd
              ? 'Waiting for 1 more player (or remove one)'
              : joinedCount < 4
              ? 'Need at least 4 players to start'
              : 'Waiting for players...'}
          </Button>
        </div>
      ) : (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-center text-xs text-indigo-900 font-medium">
          Waiting for the queue to reach {expectedPlayers} players or for the host to start...
        </div>
      )}
    </div>
  );
};

export default DuelLobby;
