import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import Button from '../components/Button';
import { getBackendUrl, getPublicUrl } from '../config';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [filter, setFilter] = useState('all');

  const fetchLeaderboard = async () => {
    try {
      const backendUrl = getBackendUrl();
      if (!backendUrl) {
        console.error('Backend URL is not configured (VITE_SOCKET_URL)');
        return;
      }
      const res = await fetch(`${backendUrl}/leaderboard?filter=${filter}`);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 3000);
    return () => clearInterval(interval);
  }, [filter]);

  const joinUrl = getPublicUrl();

  return (
    <div className="flex-grow flex flex-col md:flex-row h-screen bg-bg overflow-hidden text-text">
      {/* Left side - QR and Info */}
      <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-8 bg-surface border-r border-border shadow-sm z-10">
        <h1 className="text-6xl font-bold text-primary mb-8 text-center">ONE BRAIN</h1>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-border mb-8">
          <QRCode value={joinUrl} size={300} fgColor="#1E1B3A" />
        </div>
        <h2 className="text-4xl font-bold text-text mb-2">Scan to Play!</h2>
        <p className="text-2xl text-text-muted text-center leading-relaxed mt-4">
          Join the live multiplayer game.<br/>
          Combine your clues to answer!
        </p>
      </div>

      {/* Right side - Leaderboard */}
      <div className="w-full md:w-2/3 p-8 flex flex-col h-full bg-bg">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-5xl font-bold uppercase tracking-widest text-text">
            Leaderboard
          </h2>
          <div className="flex space-x-2 bg-surface p-1 rounded-2xl border border-border shadow-sm">
            {['all', 'small', 'large'].map(f => (
              <Button
                key={f}
                onClick={() => setFilter(f)}
                variant={filter === f ? 'primary' : 'ghost'}
                className="px-6 py-2 rounded-xl text-lg capitalize"
              >
                {f === 'all' ? 'All Teams' : f === 'small' ? 'Small (3-5)' : 'Large (6-8)'}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="flex-grow overflow-y-auto pr-4 space-y-4 custom-scrollbar">
          {leaderboard.length === 0 ? (
            <div className="text-center text-text-muted font-medium text-3xl mt-32">No teams have scored yet. Be the first!</div>
          ) : (
            leaderboard.map((entry, index) => (
              <div 
                key={entry.id} 
                className={`flex items-center justify-between p-6 rounded-[20px] border shadow-sm transition-all ${
                  index === 0 ? 'bg-[#FFF9E6] border-[#F59E0B]' : 
                  index === 1 ? 'bg-[#F3F4F6] border-[#9CA3AF]' : 
                  index === 2 ? 'bg-[#FFF1F2] border-[#F43F5E]' : 
                  'bg-surface border-border'
                }`}
              >
                <div className="flex items-center space-x-8 w-3/4">
                  <div className={`text-5xl font-black ${
                    index === 0 ? 'text-[#F59E0B]' : 
                    index === 1 ? 'text-[#9CA3AF]' : 
                    index === 2 ? 'text-[#F43F5E]' : 
                    'text-text-muted'
                  }`}>
                    #{index + 1}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="text-3xl font-bold text-text truncate">{entry.names}</div>
                    <div className="text-text-muted font-medium text-lg">{entry.teamSize} Players</div>
                  </div>
                </div>
                <div className="text-6xl font-bold text-primary tracking-wider font-mono">
                  {entry.score}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
