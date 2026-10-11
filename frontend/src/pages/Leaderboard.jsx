import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import Button from '../components/Button';
import { getBackendUrl, getPublicUrl } from '../config';
import { useSocket } from '../SocketContext';
import { Trophy, Award, Clock, Users, Play, Radio, Flame, Sparkles, CheckCircle } from 'lucide-react';

const Leaderboard = () => {
  const { socket } = useSocket();
  const [filter, setFilter] = useState('all');
  
  // Quick play state
  const [quickLeaderboard, setQuickLeaderboard] = useState([]);
  
  // Event mode state
  const [isEventLive, setIsEventLive] = useState(false);
  const [eventData, setEventData] = useState(null);

  const backendUrl = getBackendUrl();
  const joinUrl = getPublicUrl();

  const fetchStatusAndData = async () => {
    try {
      if (!backendUrl) return;
      
      // 1. Check Event Status
      const evStatusRes = await fetch(`${backendUrl}/api/event/status`);
      const evStatusData = await evStatusRes.json();
      
      if (evStatusData.success && evStatusData.isLive) {
        setIsEventLive(true);
        const evBoardRes = await fetch(`${backendUrl}/event/leaderboard?filter=${filter}`);
        const evBoardData = await evBoardRes.json();
        if (evBoardData.success) {
          setEventData(evBoardData.data);
        }
      } else {
        setIsEventLive(false);
        // Fallback to Quick Play Leaderboard
        const qpRes = await fetch(`${backendUrl}/leaderboard?filter=${filter}`);
        const qpData = await qpRes.json();
        if (qpData.success) {
          setQuickLeaderboard(qpData.leaderboard);
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };

  useEffect(() => {
    fetchStatusAndData();
    const interval = setInterval(fetchStatusAndData, 3000);
    return () => clearInterval(interval);
  }, [filter, backendUrl]);

  // Real-time socket updates for event leaderboard
  useEffect(() => {
    if (!socket) return;

    socket.emit('join_leaderboard', (res) => {
      if (res?.success && res.data) {
        setIsEventLive(res.isLive);
        setEventData(res.data);
      }
    });

    const handleEventUpdate = (data) => {
      if (data) {
        setIsEventLive(true);
        setEventData(data);
      }
    };

    socket.on('event_leaderboard_update', handleEventUpdate);

    return () => {
      socket.off('event_leaderboard_update', handleEventUpdate);
    };
  }, [socket]);

  // Filtered event leaderboard
  const rawEventBoard = eventData?.leaderboard || [];
  const filteredEventBoard = rawEventBoard.filter(e => {
    if (filter === 'small') return e.teamSize >= 3 && e.teamSize <= 5;
    if (filter === 'large') return e.teamSize >= 6 && e.teamSize <= 8;
    return true;
  });

  const podium = eventData?.podium || [];
  const playingNow = eventData?.playingNow || [];
  const slotUsage = eventData?.slotUsage;
  const currentEvent = eventData?.event;

  return (
    <div className="flex-grow flex flex-col md:flex-row h-screen bg-[#F8FAFC] overflow-hidden text-[#1E1B3A]">
      
      {/* Left side - Projector QR & Live Info Panel */}
      <div className="w-full md:w-1/3 flex flex-col items-center justify-between p-8 bg-white border-r border-[#E2E8F0] shadow-sm z-10 overflow-y-auto">
        <div className="text-center w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#5046E5] text-xs font-bold mb-4">
            <Radio size={14} className="animate-pulse text-[#DC2626]" />
            <span>LIVE MULTIPLAYER ARENA</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-[#5046E5] tracking-tight mb-2">
            ONE BRAIN
          </h1>
          <p className="text-sm font-semibold text-[#64748B] mb-6">
            Inside each team, every player holds a secret clue. Talk to solve!
          </p>

          <div className="bg-white p-5 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-[#E2E8F0] inline-block mb-4">
            <QRCode value={joinUrl} size={220} fgColor="#1E1B3A" />
          </div>

          <div className="text-2xl font-black text-[#1E1B3A]">
            Scan to Join the Race!
          </div>
          <p className="text-sm text-[#64748B] font-medium mt-1">
            3 to 8 players per team · 120s per round
          </p>
        </div>

        {/* Live Slot Status (If Event Live) */}
        {isEventLive && slotUsage && (
          <div className="w-full mt-6 p-4 bg-[#F1F5F9] rounded-2xl border border-[#E2E8F0] space-y-1.5 text-center">
            <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Server Capacity Control
            </div>
            <div className="text-sm font-black text-[#1E1B3A]">
              {slotUsage.formatted}
            </div>
          </div>
        )}
      </div>

      {/* Right side - Main Leaderboard */}
      <div className="w-full md:w-2/3 p-6 lg:p-8 flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-3xl lg:text-4xl font-black text-[#1E1B3A] tracking-tight">
                {isEventLive ? (currentEvent?.name || 'Championship Leaderboard') : 'Leaderboard'}
              </h2>
              {isEventLive && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#DC2626] text-white text-xs font-black uppercase tracking-wider animate-pulse">
                  LIVE RACE
                </span>
              )}
            </div>
            {isEventLive && currentEvent?.prizeBanner && (
              <div className="text-xs font-bold text-[#D97706] mt-0.5 flex items-center gap-1">
                <Sparkles size={13} />
                <span>{currentEvent.prizeBanner}</span>
              </div>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex space-x-1.5 bg-white p-1 rounded-2xl border border-[#E2E8F0] shadow-2xs self-start">
            {['all', 'small', 'large'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === f
                    ? 'bg-[#5046E5] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#1E1B3A]'
                }`}
              >
                {f === 'all' ? 'All Teams' : f === 'small' ? 'Small (3–5)' : 'Large (6–8)'}
              </button>
            ))}
          </div>
        </div>

        {/* Live Ticker Bar (Event Mode) */}
        {isEventLive && eventData?.ticker && (
          <div className="mb-4 px-4 py-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs font-bold text-[#92400E] flex items-center gap-2 overflow-hidden shadow-2xs">
            <Flame size={15} className="text-[#D97706] shrink-0" />
            <span className="truncate">{eventData.ticker}</span>
          </div>
        )}

        {/* Playing Now Strip (Event Mode) */}
        {isEventLive && playingNow.length > 0 && (
          <div className="mb-4 p-3 bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs space-y-1.5">
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
              <Play size={12} className="text-[#10B981] fill-[#10B981]" />
              <span>Playing Now in Active Rounds ({playingNow.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {playingNow.map(p => (
                <div
                  key={p.roomId}
                  className="px-3 py-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-full text-xs font-bold text-[#1E1B3A] flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping"></span>
                  <span>{p.teamName}</span>
                  <span className="text-[#5046E5] font-semibold">R{p.currentRound}/3</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PODIUM SECTION (Event Mode, Top 3) */}
        {isEventLive && podium.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* 2nd Place */}
            <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] text-center shadow-2xs flex flex-col justify-between">
              <div className="text-[11px] font-bold text-[#64748B] uppercase">#2 Silver</div>
              <div className="text-base font-black text-[#1E1B3A] truncate mt-1">
                {podium[1]?.teamName || '—'}
              </div>
              <div className="text-lg font-black text-[#5046E5] font-mono mt-0.5">
                {podium[1]?.totalTimeFormatted || '—'}
              </div>
            </div>

            {/* 1st Place (Gold Hero) */}
            <div className="p-3 bg-gradient-to-b from-[#FFFBEB] to-white rounded-2xl border-2 border-[#F59E0B] text-center shadow-xs flex flex-col justify-between scale-[1.03]">
              <div className="text-[11px] font-black text-[#D97706] uppercase flex items-center justify-center gap-1">
                <Trophy size={13} className="text-[#F59E0B]" />
                <span>#1 Champion</span>
              </div>
              <div className="text-lg font-black text-[#1E1B3A] truncate mt-1">
                {podium[0]?.teamName || '—'}
              </div>
              <div className="text-xl font-black text-[#D97706] font-mono mt-0.5">
                {podium[0]?.totalTimeFormatted || '—'}
              </div>
            </div>

            {/* 3rd Place */}
            <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] text-center shadow-2xs flex flex-col justify-between">
              <div className="text-[11px] font-bold text-[#64748B] uppercase">#3 Bronze</div>
              <div className="text-base font-black text-[#1E1B3A] truncate mt-1">
                {podium[2]?.teamName || '—'}
              </div>
              <div className="text-lg font-black text-[#5046E5] font-mono mt-0.5">
                {podium[2]?.totalTimeFormatted || '—'}
              </div>
            </div>
          </div>
        )}

        {/* SCROLLABLE RANKINGS LIST */}
        <div className="flex-grow overflow-y-auto pr-2 space-y-2.5 custom-scrollbar">
          {/* EVENT MODE RANKINGS */}
          {isEventLive ? (
            filteredEventBoard.length === 0 ? (
              <div className="text-center text-[#94A3B8] font-bold text-2xl mt-24">
                No completed team runs yet. Be the first to race!
              </div>
            ) : (
              filteredEventBoard.map((entry, idx) => (
                <div
                  key={entry.roomId || idx}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    idx === 0 && !entry.isPractice ? 'bg-[#FFFBEB] border-[#FDE68A] shadow-xs' :
                    idx === 1 && !entry.isPractice ? 'bg-[#F8FAFC] border-[#E2E8F0]' :
                    idx === 2 && !entry.isPractice ? 'bg-[#FFF7ED] border-[#FFEDD5]' :
                    entry.isPractice ? 'bg-[#F8FAFC]/60 border-[#E2E8F0] opacity-80' :
                    'bg-white border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`text-2xl font-black font-mono w-10 text-center ${
                      idx === 0 && !entry.isPractice ? 'text-[#D97706]' :
                      idx === 1 && !entry.isPractice ? 'text-[#64748B]' :
                      idx === 2 && !entry.isPractice ? 'text-[#C2410C]' :
                      'text-[#94A3B8]'
                    }`}>
                      #{entry.rank || idx + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-[#1E1B3A] truncate">
                          {entry.teamName}
                        </span>
                        {entry.isPractice && (
                          <span className="px-2 py-0.2 rounded-full bg-[#E2E8F0] text-[#475569] text-[10px] font-bold">
                            Practice
                          </span>
                        )}
                        {entry.status === 'incomplete' && (
                          <span className="px-2 py-0.2 rounded-full bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                            Incomplete
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#64748B] mt-0.5">
                        <span>{entry.teamSize || entry.members?.length || 0} Players</span>
                        <span>·</span>
                        <span>Solved: {entry.roundsSolved || 0}/3</span>
                        {entry.members && entry.members.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">
                              {entry.members.join(', ')}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Badges */}
                      {entry.badges && entry.badges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {entry.badges.map(b => (
                            <span
                              key={b}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                                b === 'Flawless' ? 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]' :
                                b === 'Fastest Round' ? 'bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE]' :
                                b === 'No Hints' ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]' :
                                'bg-[#F1F5F9] text-[#64748B]'
                              }`}
                            >
                              {b === 'Flawless' && <Sparkles size={11} />}
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Total Time Column */}
                  <div className="text-right shrink-0 pl-4">
                    <div className="text-3xl font-black text-[#5046E5] font-mono tracking-tight">
                      {entry.totalTimeFormatted || `${entry.totalTime}s`}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] font-semibold">
                      {entry.totalWrong ? `+${entry.totalWrong * 5}s wrong` : '0 errors'}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            /* QUICK PLAY RANKINGS (PRESERVED) */
            quickLeaderboard.length === 0 ? (
              <div className="text-center text-[#94A3B8] font-bold text-2xl mt-24">
                No teams have scored yet. Be the first!
              </div>
            ) : (
              quickLeaderboard.map((entry, index) => (
                <div 
                  key={entry.id || index} 
                  className={`flex items-center justify-between p-5 rounded-2xl border shadow-2xs transition-all ${
                    index === 0 ? 'bg-[#FFFBEB] border-[#FDE68A]' : 
                    index === 1 ? 'bg-[#F8FAFC] border-[#E2E8F0]' : 
                    index === 2 ? 'bg-[#FFF7ED] border-[#FFEDD5]' : 
                    'bg-white border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex items-center space-x-6 w-3/4">
                    <div className={`text-3xl font-black font-mono ${
                      index === 0 ? 'text-[#D97706]' : 
                      index === 1 ? 'text-[#64748B]' : 
                      index === 2 ? 'text-[#C2410C]' : 
                      'text-[#94A3B8]'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="text-xl font-bold text-[#1E1B3A] truncate">{entry.names}</div>
                      <div className="text-[#64748B] font-medium text-sm">{entry.teamSize} Players</div>
                    </div>
                  </div>
                  <div className="text-4xl font-black text-[#5046E5] font-mono tracking-wider">
                    {entry.score}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
