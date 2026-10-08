import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [filter, setFilter] = useState('all');

  const fetchLeaderboard = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : window.location.origin);
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
    const interval = setInterval(fetchLeaderboard, 3000); // 3 seconds live update
    return () => clearInterval(interval);
  }, [filter]);

  const joinUrl = window.location.origin;

  return (
    <div className="flex-grow flex flex-col md:flex-row h-screen bg-gray-900 overflow-hidden">
      {/* Left side - QR and Info */}
      <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-8 bg-gray-800 border-r border-gray-700">
        <h1 className="text-6xl font-bold text-blue-400 neon-text mb-8 text-center">ONE BRAIN</h1>
        <div className="bg-white p-6 rounded-3xl shadow-[0_0_40px_rgba(59,130,246,0.3)] mb-8">
          <QRCode value={joinUrl} size={300} />
        </div>
        <h2 className="text-4xl font-bold text-white mb-2">Scan to Play!</h2>
        <p className="text-2xl text-gray-400 text-center leading-relaxed mt-4">
          Join the live multiplayer game.<br/>
          Combine your clues to answer!
        </p>
      </div>

      {/* Right side - Leaderboard */}
      <div className="w-full md:w-2/3 p-8 flex flex-col h-full">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-5xl font-bold uppercase tracking-widest text-green-400 neon-text-green">
            Leaderboard
          </h2>
          <div className="flex space-x-2 bg-gray-800 p-1 rounded-xl">
            {['all', 'small', 'large'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-lg font-bold capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {f === 'all' ? 'All Teams' : f === 'small' ? 'Small (3-5)' : 'Large (6-8)'}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-grow overflow-y-auto pr-4 space-y-4 custom-scrollbar">
          {leaderboard.length === 0 ? (
            <div className="text-center text-gray-500 text-3xl mt-32">No teams have scored yet. Be the first!</div>
          ) : (
            leaderboard.map((entry, index) => (
              <div 
                key={entry.id} 
                className={`flex items-center justify-between p-6 rounded-2xl border ${index === 0 ? 'bg-yellow-500/20 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : index === 1 ? 'bg-gray-300/10 border-gray-400' : index === 2 ? 'bg-orange-700/20 border-orange-700' : 'bg-gray-800 border-gray-700'} transition-all`}
              >
                <div className="flex items-center space-x-8 w-3/4">
                  <div className={`text-5xl font-black ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-600' : 'text-gray-500'}`}>
                    #{index + 1}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="text-3xl font-bold text-white truncate">{entry.names}</div>
                    <div className="text-gray-400 text-lg">{entry.teamSize} Players</div>
                  </div>
                </div>
                <div className="text-6xl font-bold text-blue-400 tracking-wider font-mono">
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
