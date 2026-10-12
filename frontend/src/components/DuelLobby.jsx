import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import {
  Play,
  Swords,
  Trash2,
  Tv,
  Clock,
  Sparkles,
  Shield,
  Edit2,
  AlertCircle,
  Trophy
} from 'lucide-react';
import Button from './Button';
import InviteCard from './InviteCard';

const ALLOWED_COUNTS = [4, 6, 8, 10, 12, 14, 16];

const DuelLobby = ({ duel }) => {
  const { socket, myPlayerId, clockOffset } = useSocket();
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
      const update = () => setCountdownSec(Math.max(0, Math.ceil(((duel.countdownEndTime || Date.now()) - (Date.now() + clockOffset)) / 1000)));
      update();
      interval = setInterval(update, 250);
    } else if (duel.status === 'team_reveal') {
      const remaining = duel.teamRevealEndTime
        ? Math.max(0, Math.ceil((duel.teamRevealEndTime - (Date.now() + clockOffset)) / 1000))
        : 10;
      setMeetTeamSec(remaining);
      interval = setInterval(() => {
        setMeetTeamSec((prev) => (prev > 1 ? prev - 1 : 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [duel.status, duel.countdownEndTime, duel.teamRevealEndTime, clockOffset]);

  const isHost = duel.hostId === myPlayerId;
  const players = duel.players || [];
  const joinedCount = players.length;
  const expectedPlayers = duel.expectedPlayers || 4;
  const isOdd = joinedCount % 2 !== 0;
  const canStartNow = !isOdd && joinedCount >= 4 && (duel.status === 'lobby' || duel.status === 'countdown');

  const bigScreenUrl = `/duel/${duel.code}`;

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
  // VIEW: TEAM DISTRIBUTION (reveal screen before match starts)
  // =========================================================================
  if (duel.status === 'team_reveal') {
    const teamRed = duel.teamRed || {};
    const teamBlue = duel.teamBlue || {};
    const rName = teamRed.name || 'Team Red';
    const bName = teamBlue.name || 'Team Blue';
    const redPlayers = teamRed.players || (duel.myTeamKey === 'red' ? duel.teammates : duel.opponents) || [];
    const bluePlayers = teamBlue.players || (duel.myTeamKey === 'blue' ? duel.teammates : duel.opponents) || [];
    const myTeamKey = duel.myTeamKey;

    return (
      <div className="w-full max-w-[540px] flex flex-col items-center gap-5 text-[#1E1B3A] pb-8 animate-fade-in text-center">
        {/* Countdown Pill & Host Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 text-white rounded-full font-black text-sm shadow-md animate-pulse">
            <Clock size={16} />
            <span>Match starting in {meetTeamSec}s...</span>
          </div>

          {isHost && (
            <button
              onClick={handleStartNow}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-extrabold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Play size={13} fill="currentColor" />
              <span>Start Game Now</span>
            </button>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#5046E5] rounded-full text-xs font-black uppercase tracking-wider">
            <Swords size={13} />
            <span>Team Distribution</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#1E1B3A]">Teams Divided!</h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-[400px] mx-auto">
            Check your teammates below. Coordinate closely — each player holds a unique clue!
          </p>
        </div>

        {/* Team Matchup: Team Red VS Team Blue */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* TEAM RED */}
          <div className={`rounded-2xl p-4 border-2 shadow-sm text-left flex flex-col justify-between transition-all ${
            myTeamKey === 'red'
              ? 'bg-gradient-to-br from-red-50 to-orange-50/70 border-red-400 ring-2 ring-red-200'
              : 'bg-white border-red-200'
          }`}>
            <div>
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-red-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shadow-2xs">
                    <Shield size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600 block">
                      {myTeamKey === 'red' ? 'Your Team' : 'Opponents'}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-red-950 truncate max-w-[150px]">
                      {rName}
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-red-100 text-red-800">
                  {redPlayers.length} Players
                </span>
              </div>

              <div className="space-y-1.5">
                {redPlayers.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      p.isYou || p.name === duel.myNickname
                        ? 'bg-red-500 text-white border-red-600 shadow-2xs'
                        : 'bg-white/90 text-gray-800 border-red-100'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {(p.isYou || p.name === duel.myNickname) && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 bg-white text-red-600 rounded-full">
                        YOU
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TEAM BLUE */}
          <div className={`rounded-2xl p-4 border-2 shadow-sm text-left flex flex-col justify-between transition-all ${
            myTeamKey === 'blue'
              ? 'bg-gradient-to-br from-blue-50 to-indigo-50/70 border-blue-400 ring-2 ring-blue-200'
              : 'bg-white border-blue-200'
          }`}>
            <div>
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shadow-2xs">
                    <Shield size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                      {myTeamKey === 'blue' ? 'Your Team' : 'Opponents'}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-blue-950 truncate max-w-[150px]">
                      {bName}
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800">
                  {bluePlayers.length} Players
                </span>
              </div>

              <div className="space-y-1.5">
                {bluePlayers.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      p.isYou || p.name === duel.myNickname
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : 'bg-white/90 text-gray-800 border-blue-100'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {(p.isYou || p.name === duel.myNickname) && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 bg-white text-blue-600 rounded-full">
                        YOU
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Strategy Footer Note */}
        <div className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3 text-xs text-gray-600 font-medium">
          First team to solve <strong>3 keywords</strong> wins the duel. Get ready to collaborate!
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
        <div className="flex items-center gap-2">
          <Link
            to="/arena"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E7EB] hover:border-amber-400 rounded-full text-xs font-bold text-amber-700 shadow-2xs transition-colors"
            title="View Arena Leaderboard"
          >
            <Trophy size={14} className="text-amber-500" />
            <span>Leaderboard</span>
          </Link>
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
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs">
        <InviteCard roomCode={duel.code} label="Duel Code" shareText="Join my One Brain duel" />
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
