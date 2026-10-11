import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Swords, Plus, ArrowRight, Scan, X, Trophy, Flame, Users, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { getBackendUrl } from '../config';

const QrScannerWrapper = ({ onScan }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', { qrbox: { width: 250, height: 250 }, fps: 5 }, false);
    scanner.render(
      (text) => {
        scanner.clear();
        onScan(text);
      },
      (err) => {}
    );
    return () => {
      scanner.clear().catch(e => console.error(e));
    };
  }, [onScan]);

  return <div id="reader" className="w-full bg-white text-[#1E1B3A] rounded-lg"></div>;
};

const Landing = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { createRoom, createDuel, joinRoom, isConnected, connectionError, socket } = useSocket();
  
  const [mode, setMode] = useState('quick'); // 'quick' | 'duel' | 'event'
  const [modeSelectedManually, setModeSelectedManually] = useState(false);
  const [nickname, setNickname] = useState('');
  const [teamName, setTeamName] = useState('');
  const [expectedPlayers, setExpectedPlayers] = useState(8); // Default 8 players for Duel
  const [roomCode, setRoomCode] = useState((code || '').toUpperCase());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [eventStatus, setEventStatus] = useState(null);

  useEffect(() => {
    if (code) {
      setRoomCode(code.toUpperCase());
    }
  }, [code]);

  useEffect(() => {
    const fetchEventStatus = async () => {
      try {
        const backendUrl = getBackendUrl();
        if (!backendUrl) return;
        const res = await fetch(`${backendUrl}/api/event/status`);
        const data = await res.json();
        if (data.success) {
          setEventStatus(data);
          if (data.isLive && !modeSelectedManually && !code) {
            setMode('event');
          }
        }
      } catch (err) {
        console.error('Failed to fetch event status:', err);
      }
    };
    fetchEventStatus();
  }, [modeSelectedManually, code]);

  const handleSelectMode = (newMode) => {
    setModeSelectedManually(true);
    setMode(newMode);
    setError('');
  };

  const handleCreate = () => {
    setError('');
    if (!nickname.trim()) return setError('Nickname is required');
    
    setLoading(true);
    if (mode === 'event') {
      if (!teamName.trim()) {
        setLoading(false);
        return setError('Team name is required for Event Mode');
      }
      createRoom({ nickname: nickname.trim(), mode: 'event', teamName: teamName.trim() }, (res) => {
        setLoading(false);
        if (res.error) return setError(res.error);
        navigate(`/room/${res.roomCode}`);
      });
    } else if (mode === 'duel') {
      createDuel({ nickname: nickname.trim(), expectedPlayers }, (res) => {
        setLoading(false);
        if (res.error) return setError(res.error);
        const targetCode = res.duelCode || res.roomCode;
        navigate(`/room/${targetCode}`, { state: { duel: res.duelState } });
      });
    } else {
      createRoom({ nickname: nickname.trim(), mode: 'quick' }, (res) => {
        setLoading(false);
        if (res.error) return setError(res.error);
        navigate(`/room/${res.roomCode}`);
      });
    }
  };

  const handleJoin = () => {
    setError('');
    if (!nickname.trim()) return setError('Nickname is required');
    if (!roomCode.trim()) return setError('Room code is required');
    setLoading(true);
    const cleanCode = roomCode.trim().toUpperCase();
    joinRoom(cleanCode, nickname.trim(), (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      const targetCode = res.roomCode || res.duelCode || cleanCode;
      navigate(`/room/${targetCode}`, { state: { duel: res.duelState } });
    });
  };

  const handleScan = (resultText) => {
    if (resultText) {
      const text = resultText.trim();
      const match = text.match(/(?:\/join\/|\/room\/|[?&]code=)([a-zA-Z0-9]{6})/i);
      if (match) {
        setRoomCode(match[1].toUpperCase());
        setShowScanner(false);
      } else if (/^[a-zA-Z0-9]{6}$/.test(text)) {
        setRoomCode(text.toUpperCase());
        setShowScanner(false);
      }
    }
  };

  const isEventLive = !!eventStatus?.isLive;

  return (
    <div className="w-full max-w-[420px] mx-auto px-2 pb-12 flex flex-col items-center z-10 relative">
      
      {/* Live Event Announcement Banner */}
      {isEventLive && (
        <Link
          to="/leaderboard"
          className="w-full mb-3 p-2.5 bg-gradient-to-r from-[#FEF3C7] to-[#FEE2E2] border border-[#FDE68A] rounded-xl flex items-center justify-between text-left shadow-xs hover:opacity-95 transition-all group"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] animate-pulse"></span>
            <span className="text-[12px] font-bold text-[#991B1B] uppercase tracking-wider">Live Event:</span>
            <span className="text-[12px] font-semibold text-[#1E1B3A] truncate max-w-[170px]">
              {eventStatus?.event?.name || 'Championship Race'}
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#5046E5] flex items-center gap-1 group-hover:underline">
            Leaderboard →
          </span>
        </Link>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-[24px] border border-[#E9ECEF] shadow-[0_2px_16px_rgba(0,0,0,0.03)] p-6 sm:p-7 w-full space-y-5">
        
        {/* Mode Selector Tabs */}
        <div className={`grid ${isEventLive ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 p-1 bg-[#F3F4F6] rounded-xl`}>
          <button
            type="button"
            onClick={() => handleSelectMode('quick')}
            className={`py-2 px-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'quick'
                ? 'bg-white text-[#5046E5] shadow-xs'
                : 'text-[#6B7280] hover:text-[#1E1B3A]'
            }`}
          >
            <Zap size={14} />
            <span>Quick</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectMode('duel')}
            className={`py-2 px-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'duel'
                ? 'bg-white text-red-600 shadow-xs'
                : 'text-[#6B7280] hover:text-[#1E1B3A]'
            }`}
          >
            <Swords size={14} />
            <span>Duel</span>
          </button>
          {isEventLive && (
            <button
              type="button"
              onClick={() => handleSelectMode('event')}
              className={`py-2 px-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'event'
                  ? 'bg-white text-[#5046E5] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#1E1B3A]'
              }`}
            >
              <Trophy size={14} className="text-[#F59E0B]" />
              <span>Event</span>
              <span className="px-1 py-0.2 bg-[#DC2626] text-white text-[8px] font-black rounded-full uppercase">
                Live
              </span>
            </button>
          )}
        </div>

        {/* Header Icon + Titles */}
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
            mode === 'event'
              ? 'bg-[#FEF3C7] text-[#D97706]'
              : mode === 'duel'
              ? 'bg-gradient-to-tr from-red-100 to-indigo-100 text-red-600'
              : 'bg-[#EEF2FF] text-[#5046E5]'
          }`}>
            {mode === 'event' ? (
              <Trophy size={24} strokeWidth={2} />
            ) : (
              <Swords size={22} strokeWidth={2} />
            )}
          </div>
          <h2 className="text-[22px] font-bold text-[#1E1B3A] tracking-tight">
            {mode === 'event'
              ? (eventStatus?.event?.name || 'Championship Race')
              : mode === 'duel'
              ? 'Head-to-Head Duel'
              : 'Enter the Arena'}
          </h2>
          <p className="text-[13px] text-[#6B7280] mt-1 max-w-[280px] leading-relaxed">
            {mode === 'event'
              ? `3 rounds · Fastest combined time wins · ${eventStatus?.event?.category || 'Mixed'}`
              : mode === 'duel'
              ? '4 to 16 players · 2 teams race to 3 solved keywords'
              : 'Challenge your friends. Find out who thinks fastest.'}
          </p>

          {mode === 'event' && eventStatus?.slotUsage && (
            <div className="mt-2 px-2.5 py-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full text-[11px] font-semibold text-[#4B5563] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
              <span>{eventStatus.slotUsage.formatted}</span>
            </div>
          )}
        </div>

        {!isConnected && !connectionError && (
          <div className="text-center text-[#B45309] bg-[#FEF3C7] py-2 px-3 rounded-lg text-xs font-medium">
            Connecting to server...
          </div>
        )}
        {connectionError && (
          <div className="text-center text-[#DC2626] bg-[#FEF2F2] py-2 px-3 rounded-lg text-xs font-medium border border-[#FEE2E2]">
            {connectionError}
          </div>
        )}

        {/* Inputs & Actions */}
        <div className="space-y-4">
          {mode === 'event' && (
            <div>
              <label className="block text-[13px] font-semibold text-[#1E1B3A] mb-1.5 flex justify-between">
                <span>Team Name</span>
                <span className="text-[11px] font-normal text-[#9CA3AF]">Max 20 chars</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Brainiacs"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value.slice(0, 20))}
                maxLength={20}
                className="w-full bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[14px] font-medium text-[#1E1B3A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-[13px] font-semibold text-[#1E1B3A] mb-1.5">
              {mode === 'event' ? 'Your Nickname (Host)' : 'Nickname'}
            </label>
            <input
              type="text"
              placeholder="Your Name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={15}
              className="w-full bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[14px] font-medium text-[#1E1B3A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all"
            />
          </div>

          {mode === 'duel' && (
            <div className="bg-[#FEF2F2]/60 border border-[#FEE2E2] rounded-[16px] p-3.5 space-y-2">
              <label className="block text-[13px] font-bold text-[#1E1B3A] flex items-center justify-between">
                <span>How many players are playing?</span>
                <span className="text-[11px] font-extrabold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  {expectedPlayers / 2} vs {expectedPlayers / 2}
                </span>
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {[4, 6, 8, 10, 12, 14, 16].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setExpectedPlayers(num)}
                    className={`py-2 rounded-[10px] font-extrabold text-[14px] transition-all border cursor-pointer ${
                      expectedPlayers === num
                        ? 'bg-red-600 border-red-600 text-white shadow-xs'
                        : 'bg-white border-[#E5E7EB] text-[#374151] hover:border-red-300 hover:text-red-600'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#6B7280] text-center pt-0.5">
                Host counts as 1 of the {expectedPlayers} players. Teams will be split equally.
              </p>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!isConnected || loading}
            className={`w-full py-3.5 font-bold rounded-[12px] text-[15px] flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 cursor-pointer ${
              mode === 'duel'
                ? 'bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:opacity-95 text-white shadow-md'
                : 'bg-[#5046E5] hover:bg-[#4338CA] text-white'
            }`}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{mode === 'duel' ? 'Creating Duel...' : 'Creating Room...'}</span>
              </>
            ) : mode === 'event' ? (
              <>
                <Trophy size={18} strokeWidth={2.5} />
                <span>Enter Event Race</span>
              </>
            ) : mode === 'duel' ? (
              <>
                <Swords size={18} strokeWidth={2.5} />
                <span>Create Duel ({expectedPlayers} Players)</span>
              </>
            ) : (
              <>
                <Plus size={18} strokeWidth={2.5} />
                <span>Create Room</span>
              </>
            )}
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
            <span className="flex-shrink-0 mx-3 text-[#9CA3AF] text-[12px] font-medium">
              {mode === 'duel' ? 'Or Join Duel' : 'Or Join Room'}
            </span>
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#1E1B3A] mb-1.5 flex justify-between">
              <span>{mode === 'duel' ? 'Duel or Room Code' : 'Room Code'}</span>
              <span className="text-[11px] font-normal text-[#9CA3AF]">6 characters</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={mode === 'duel' ? 'DUEL CODE' : 'ROOM CODE'}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="flex-grow bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[15px] font-bold tracking-wider text-[#1E1B3A] placeholder-[#D1D5DB] focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all uppercase"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="w-[46px] h-[46px] flex-shrink-0 flex items-center justify-center bg-white border border-[#E5E7EB] rounded-[12px] text-[#5046E5] hover:bg-[#F9FAFB] transition-colors"
                title="Scan QR Code"
              >
                <Scan size={20} strokeWidth={2} />
              </button>
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={!isConnected || loading}
            className="w-full py-3.5 bg-white border-2 border-[#5046E5] hover:bg-[#EEF2FF]/40 disabled:opacity-50 text-[#5046E5] font-semibold rounded-[12px] text-[15px] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin text-[#5046E5]" />
                <span>Joining...</span>
              </>
            ) : (
              <>
                <ArrowRight size={18} strokeWidth={2.5} />
                <span>{mode === 'duel' ? 'Join Duel' : 'Join Room'}</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="text-[#DC2626] text-center text-[13px] font-semibold bg-[#FEF2F2] py-2.5 px-3 rounded-xl border border-[#FEE2E2] flex items-center justify-center gap-2 animate-shake">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer Text & Arena Link */}
      <div className="text-center mt-5 space-y-2">
        <Link
          to="/arena"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#E5E7EB] hover:border-indigo-300 rounded-full text-[12px] font-bold text-[#5046E5] shadow-2xs transition-colors"
        >
          <Swords size={13} />
          <span>View Live Duels in Arena →</span>
        </Link>
        <div className="space-y-0.5">
          <div className="text-[13px] font-bold text-[#4B5563]">Better with your people.</div>
          <div className="text-[12px] text-[#9CA3AF]">
            {mode === 'duel' ? '4 to 16 players per duel · Even numbers recommended' : '2–8 players · One shared challenge'}
          </div>
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-[#1E1B3A]/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-4 shadow-xl">
            <button 
              onClick={() => setShowScanner(false)}
              className="absolute -top-10 right-0 text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={26} />
            </button>
            <h3 className="text-center font-bold text-[#1E1B3A] mb-3">Scan Room QR Code</h3>
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] w-full">
              <QrScannerWrapper onScan={handleScan} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing;
