import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { Copy, Crown, Lock, User, ChevronDown, Check } from 'lucide-react';
import { useSocket } from '../SocketContext';
import { getPublicUrl } from '../config';

const Lobby = ({ room }) => {
  const { socket, myPlayerId } = useSocket();
  const [copied, setCopied] = useState(false);
  const isHost = room.host === myPlayerId;
  const joinUrl = `${getPublicUrl()}/join/${room.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
  const neededPlayers = Math.max(0, 3 - activePlayers.length);

  const categories = [
    'Mixed',
    'General Knowledge',
    'Movies',
    'Animals',
    'Trending Topics'
  ];

  return (
    <div className="w-full max-w-[400px] mx-auto px-2 pb-12 flex flex-col space-y-4.5 z-10 relative">
      
      {/* 1. Page Title & Badge */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-[24px] font-bold text-[#1E1B3A] tracking-tight">Room lobby</h2>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Invite your friends. The arena awaits.</p>
        </div>
        <div className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#10B981] font-semibold text-[12px] flex items-center gap-1.5 self-start mt-1">
          <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
          Lobby
        </div>
      </div>

      {/* 2. Room Code & QR Card */}
      <div className="bg-white rounded-[22px] border border-[#E9ECEF] shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 text-center space-y-3">
        <div>
          <div className="text-[12px] font-medium text-[#9CA3AF]">Room code</div>
          <div className="text-[36px] font-extrabold text-[#1E1B3A] tracking-wider leading-tight mt-0.5">
            {room.id}
          </div>
        </div>

        <div className="flex justify-center py-2">
          <div className="p-1 rounded-xl bg-white">
            <QRCode value={joinUrl} size={150} fgColor="#1E1B3A" bgColor="transparent" />
          </div>
        </div>

        <div className="text-[12px] text-[#9CA3AF]">
          Scan to join this room
        </div>

        <button 
          onClick={copyLink}
          className="w-full py-3 bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#5046E5] font-semibold rounded-[12px] text-[14px] flex items-center justify-center gap-2 transition-colors mt-2"
        >
          {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={2} />}
          <span>{copied ? 'Link Copied!' : 'Copy Invite Link'}</span>
        </button>
      </div>

      {/* 3. Players Card */}
      <div className="bg-white rounded-[22px] border border-[#E9ECEF] shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[14px] text-[#1E1B3A]">
            Players ({activePlayers.length}/8)
          </span>
          <span className="text-[12px] text-[#9CA3AF] font-medium">
            Min 3 to start
          </span>
        </div>

        <div className="space-y-2">
          {activePlayers.map(p => {
            const isMe = p.id === myPlayerId;
            const isHostPlayer = p.id === room.host;
            return (
              <div
                key={p.id}
                className={`p-3 rounded-[12px] flex items-center justify-between transition-all ${
                  isHostPlayer ? 'bg-[#EEF2FF]' : 'bg-[#F9FAFB]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[13px] ${
                    isHostPlayer ? 'bg-[#5046E5]' : 'bg-[#9CA3AF]'
                  }`}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <div className="text-[13px] font-bold text-[#1E1B3A] leading-tight">
                      {p.name} {isMe && '(You)'}
                    </div>
                    {isHostPlayer && (
                      <div className="text-[11px] text-[#6B7280] font-medium mt-0.5">
                        Room Host
                      </div>
                    )}
                  </div>
                </div>
                {isHostPlayer && (
                  <Crown size={18} className="text-[#F59E0B] fill-[#F59E0B]" />
                )}
              </div>
            );
          })}

          {Array.from({ length: Math.max(0, 3 - activePlayers.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="p-3 rounded-[12px] bg-[#F9FAFB] flex items-center gap-3 text-[#9CA3AF]"
            >
              <div className="w-8 h-8 rounded-full border border-[#E5E7EB] flex items-center justify-center">
                <User size={15} className="text-[#9CA3AF]" />
              </div>
              <span className="text-[13px] font-medium text-[#9CA3AF]">
                Waiting for player...
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Category Section */}
      <div className="space-y-1.5">
        <label className="block text-[13px] font-semibold text-[#1E1B3A]">
          Category
        </label>
        {isHost ? (
          <div className="relative">
            <select
              value={room.category || 'Mixed'}
              onChange={handleCategoryChange}
              className="w-full bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[14px] font-medium text-[#1E1B3A] appearance-none focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#6B7280]">
              <ChevronDown size={18} />
            </div>
          </div>
        ) : (
          <div className="w-full bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[14px] font-medium text-[#1E1B3A] flex justify-between items-center">
            <span>{room.category || 'Mixed'}</span>
            <Lock size={16} className="text-[#9CA3AF]" />
          </div>
        )}
      </div>

      {/* 5. Start Game Button */}
      {isHost ? (
        <div className="space-y-2 pt-1">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`w-full py-3.5 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 transition-all ${
              canStart
                ? 'bg-[#5046E5] hover:bg-[#4338CA] text-white shadow-sm'
                : 'bg-[#E2E8F0] text-[#64748B] cursor-not-allowed'
            }`}
          >
            <Lock size={16} strokeWidth={2} />
            <span>Start Game</span>
          </button>

          {!canStart && (
            <div className="text-[12px] text-[#9CA3AF] text-center font-medium">
              Waiting for {neededPlayers} more {neededPlayers === 1 ? 'player' : 'players'}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-[#9CA3AF] text-[13px] font-medium py-2">
          Waiting for host to start the game...
        </div>
      )}

      {/* 6. Footer Note */}
      <div className="text-center text-[#9CA3AF] text-[12px] pt-1">
        Share the room code with your friends to get everyone into the game.
      </div>
    </div>
  );
};

export default Lobby;
