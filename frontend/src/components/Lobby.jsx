import React from 'react';
import QRCode from 'react-qr-code';
import { Copy, Users, Crown, Lock } from 'lucide-react';
import { useSocket } from '../SocketContext';

const Lobby = ({ room }) => {
  const { socket, myPlayerId } = useSocket();
  const isHost = room.host === myPlayerId;
  const joinUrl = `${window.location.origin}/join/${room.id}`;

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
    'Bollywood Films',
    'Hollywood Films',
    'Characters',
    'Famous People',
    'Cricket & Sports',
    'Memes & Internet Culture',
    'Tech & Startups',
    'VIT Pune & Pune Local'
  ];

  return (
    <div className="flex flex-col items-center max-w-md w-full mx-auto space-y-6">
      <div className="glass-panel p-6 rounded-2xl w-full text-center space-y-4">
        <h2 className="text-xl text-gray-400">ROOM CODE</h2>
        <div className="text-5xl font-mono tracking-widest text-white neon-text">{room.id}</div>
        
        <div className="flex justify-center bg-white p-4 rounded-xl mx-auto w-48 h-48">
          <QRCode value={joinUrl} size={160} />
        </div>
        
        <button 
          onClick={copyLink}
          className="flex items-center justify-center space-x-2 w-full py-2 bg-gray-800 rounded-lg text-gray-300 hover:text-white"
        >
          <Copy size={18} />
          <span>Copy Invite Link</span>
        </button>
      </div>

      <div className="glass-panel p-6 rounded-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center space-x-2">
            <Users size={20} className="text-blue-400" />
            <span>Players ({activePlayers.length}/8)</span>
          </h3>
          <span className="text-sm text-gray-400 text-right">Min 3 to start</span>
        </div>
        
        <ul className="space-y-2">
          {activePlayers.map(p => (
            <li key={p.id} className="flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-700">
              <span className={`font-semibold ${p.id === myPlayerId ? 'text-blue-400' : 'text-gray-200'}`}>
                {p.name} {p.id === myPlayerId && '(You)'}
              </span>
              {p.id === room.host && <Crown size={18} className="text-yellow-400" />}
            </li>
          ))}
          {Array.from({ length: Math.max(0, 3 - activePlayers.length) }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center justify-center bg-gray-900/50 p-3 rounded-lg border border-gray-800 border-dashed text-gray-600">
              Waiting...
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div className="glass-panel p-6 rounded-2xl w-full space-y-4 border-blue-900">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            {room.eventThemeActive ? (
              <div className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-lg flex justify-between items-center text-gray-400 cursor-not-allowed">
                <span>{room.categoryMeta?.emoji} {room.categoryMeta?.name || 'Event Theme Locked'}</span>
                <Lock size={18} />
              </div>
            ) : (
              <select 
                value={room.category}
                onChange={handleCategoryChange}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-lg focus:outline-none"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)] transition-all disabled:opacity-50 disabled:shadow-none text-xl"
          >
            START GAME
          </button>
        </div>
      ) : (
        <div className="text-center text-gray-400 animate-pulse">
          Waiting for host to start...
        </div>
      )}
    </div>
  );
};

export default Lobby;
