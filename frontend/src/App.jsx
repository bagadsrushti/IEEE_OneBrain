import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from 'react-router-dom';
import { SocketProvider } from './SocketContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import DuelAudience from './pages/DuelAudience';
import Arena from './pages/Arena';
import { Brain, LogOut, Trophy } from 'lucide-react';

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoom = location.pathname.startsWith('/room/');

  return (
    <header className="pt-6 pb-2 flex items-center justify-between relative z-10 w-full max-w-[420px] mx-auto px-4">
      <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
        <div className="w-8 h-8 rounded-lg bg-[#5046E5] flex items-center justify-center text-white shadow-sm">
          <Brain size={18} strokeWidth={2.5} />
        </div>
        <span className="font-extrabold text-[18px] tracking-wider text-[#1E1B3A]">ONE BRAIN</span>
      </Link>

      {isRoom ? (
        <button 
          onClick={() => navigate('/')} 
          className="text-[#6B7280] font-semibold flex items-center gap-1.5 hover:text-[#1E1B3A] transition-colors text-[14px]"
        >
          <LogOut size={16} /> Leave
        </button>
      ) : (
        <Link
          to="/arena"
          className="text-[#5046E5] hover:text-[#4338CA] bg-white border border-[#E5E7EB] hover:border-indigo-300 font-bold px-3 py-1.5 rounded-full text-[12px] flex items-center gap-1.5 shadow-2xs transition-all hover:shadow-xs"
          title="View Leaderboard"
        >
          <Trophy size={14} className="text-[#F59E0B]" />
          <span>Leaderboard</span>
        </Link>
      )}
    </header>
  );
}

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-bg text-text flex flex-col font-sans overflow-x-hidden">
          <AppHeader />
          <main className="flex-grow flex flex-col relative px-4">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/join/:code" element={<Landing />} />
              <Route path="/room/:code" element={<Room />} />
              <Route path="/duel/:code" element={<DuelAudience />} />
              <Route path="/arena" element={<Arena />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
