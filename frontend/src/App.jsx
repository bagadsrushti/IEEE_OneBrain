import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { SocketProvider } from './SocketContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import { Brain, LogOut } from 'lucide-react';

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoom = location.pathname.startsWith('/room/');

  return (
    <header className="pt-6 pb-2 flex items-center justify-between relative z-10 w-full max-w-[400px] mx-auto px-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#5046E5] flex items-center justify-center text-white shadow-sm">
          <Brain size={18} strokeWidth={2.5} />
        </div>
        <span className="font-extrabold text-[18px] tracking-wider text-[#1E1B3A]">ONE BRAIN</span>
      </div>

      {isRoom && (
        <button 
          onClick={() => navigate('/')} 
          className="text-[#6B7280] font-semibold flex items-center gap-1.5 hover:text-[#1E1B3A] transition-colors text-[14px]"
        >
          <LogOut size={16} /> Leave
        </button>
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
