import React from 'react';
import QRCode from 'react-qr-code';
import { Copy, Users, Crown, Lock } from 'lucide-react';
import { useSocket } from '../SocketContext';

const Lobby = ({ room }) => {
  const { socket, myPlayerId } = useSocket();
  const isHost = room.host === myPlayerId;
  const joinUrl = `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/join/${room.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
  };

  const handleStart = () => {
    socket.emit('start_game', (res) => {
      if (res.error) alert(res.error);
    });
  };

  const handleCategoryChange = (e) => {
    socket.emit('set_category', { category: e.target.value }, (res) => {
      if (res.error) console.error(res.error);
    });
  };

  const activePlayers = room.players.filter(p => p.connected);
  const canStart = activePlayers.length >= 3 && activePlayers.length <= 8;

  const categories = [
    'Mixed',
    'General Knowledge',
    'Movies',
    'Animals',
    'Trending Topics'
  ];

  return (
    <div className="flex flex-col items-center max-w-[440px] w-full mx-auto space-y-5 mt-2 pb-12 z-10 relative">
      
      {/* 1. ROOM CODE CARD */}
      <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-8 w-full text-center space-y-6 border border-[#F3F4F6]">
        <h2 className="text-[13px] text-text-muted font-bold tracking-widest uppercase mt-1">ROOM CODE</h2>
        <div className="text-[44px] sm:text-[54px] font-bold text-[#1E1B3A] tracking-wide leading-none">{room.id}</div>
        
        <div className="flex justify-center bg-[#F8F9FB] p-5 rounded-[20px] mx-auto w-[200px] h-[200px]">
          <QRCode value={joinUrl} size={160} fgColor="#1E1B3A" bgColor="transparent" />
        </div>
        
        <button 
          onClick={copyLink}
          className="w-full flex items-center justify-center space-x-2 bg-[#F8F9FB] text-[#4B5563] hover:bg-[#F3F4F6] transition-colors rounded-[16px] py-4 font-semibold text-[15px]"
        >
          <Copy size={18} />
          <span>Copy Invite Link</span>
        </button>
      </div>

      {/* 2. PLAYERS CARD */}
      <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-6 w-full border border-[#F3F4F6]">
        <div className="flex items-center justify-between mb-5 px-1">
          <h3 className="text-[17px] font-bold flex items-center space-x-2.5 text-[#1E1B3A]">
            <Users size={20} className="text-primary" />
            <span>Players <span className="text-[#9CA3AF] font-medium">({activePlayers.length}/8)</span></span>
          </h3>
          <span className="text-[13px] text-[#6B7280] font-semibold bg-[#F3F4F6] px-3.5 py-1.5 rounded-full">Min 3 to start</span>
        </div>
        
        <ul className="space-y-3">
          {activePlayers.map(p => {
             const isMe = p.id === myPlayerId;
             const isHostPlayer = p.id === room.host;
             return (
               <li key={p.id} className={`flex items-center justify-between p-3.5 rounded-[16px] ${isMe ? 'bg-[#F9FAFB] border border-[#E5E7EB]' : 'bg-[#F9FAFB] border border-transparent'}`}>
                 <div className="flex items-center gap-3.5">
                    <div className="w-[42px] h-[42px] rounded-full bg-primary flex items-center justify-center text-white font-bold text-[15px]">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-[#1E1B3A] text-[15px]">
                        {p.name} <span className="text-primary font-semibold">{isMe && '(You)'}</span>
                      </span>
                      {isHostPlayer && <span className="text-[12px] text-[#9CA3AF] font-medium leading-tight">Room Host</span>}
                    </div>
                 </div>
                 {isHostPlayer && <Crown size={20} className="text-[#FBBF24]" strokeWidth={2.5} />}
               </li>
             );
          })}
          {Array.from({ length: Math.max(0, 3 - activePlayers.length) }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center justify-center bg-transparent h-[60px] rounded-[16px] border-2 border-dashed border-[#E5E7EB] text-[#9CA3AF] font-medium text-[15px]">
              Waiting for player...
            </li>
          ))}
        </ul>
      </div>

      {/* 3. CATEGORY AND START CARD */}
      <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-6 w-full space-y-6 border border-[#F3F4F6]">
        {isHost ? (
          <>
            <div>
              <label className="block text-[13px] text-text-muted mb-2 font-bold tracking-widest uppercase">Category</label>
              {room.eventThemeActive ? (
                <div className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-[16px] p-4 text-[16px] flex justify-between items-center text-[#6B7280] font-semibold cursor-not-allowed">
                  <span>{room.categoryMeta?.emoji} {room.categoryMeta?.name || 'Event Theme Locked'}</span>
                  <Lock size={18} />
                </div>
              ) : (
                <div className="relative">
                  <select 
                    value={room.category}
                    onChange={handleCategoryChange}
                    className="w-full bg-white border border-[#E5E7EB] rounded-[16px] p-4 text-[16px] font-semibold text-[#1E1B3A] appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#9CA3AF]">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={handleStart}
              disabled={!canStart}
              className={`w-full py-4 rounded-[16px] font-bold text-[16px] flex flex-col items-center justify-center transition-all ${
                canStart 
                  ? 'bg-primary text-white shadow-[0_8px_20px_rgba(108,76,241,0.25)] hover:bg-primary-hover active:scale-98' 
                  : 'bg-[#F9FAFB] text-[#9CA3AF] cursor-not-allowed border border-[#E5E7EB]'
              }`}
            >
              <span>START GAME</span>
              {!canStart && <span className="text-[12px] font-medium mt-0.5">Waiting for {Math.max(0, 3 - activePlayers.length)} more players</span>}
            </button>
          </>
        ) : (
          <div className="text-center text-[#9CA3AF] font-medium py-6 animate-pulse">
            Waiting for host to select category and start...
          </div>
        )}
      </div>

      <div className="text-center text-[#9CA3AF] text-[13px] font-medium mt-4 pb-4">
        Share code <strong className="text-[#6B7280]">{room.id}</strong> to join via mobile or browser
      </div>
    </div>
  );
};

export default Lobby;
