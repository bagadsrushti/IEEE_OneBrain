import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { SocketProvider, useSocket } from './SocketContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import { ArrowLeft } from 'lucide-react';

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { roomData } = useSocket();
  const isRoom = location.pathname.startsWith('/room/');

  return (
    <header className="pt-10 pb-4 flex items-center justify-between relative z-10 w-full max-w-[440px] mx-auto">
      {isRoom ? (
        <button 
          onClick={() => navigate('/')} 
          className="text-[#6B7280] font-semibold flex items-center gap-1.5 hover:text-[#1E1B3A] transition-colors text-[14px]"
        >
          <ArrowLeft size={16} /> Leave
        </button>
      ) : <div className="w-[70px]"></div>}

      <h1 className="text-[24px] font-black tracking-widest text-[#1E1B3A] flex items-center gap-2.5">
        <span className="w-3 h-3 rounded-full bg-primary"></span>
        ONE BRAIN
      </h1>

      {isRoom && roomData ? (
        <div className={`px-3.5 py-1 rounded-full font-bold text-[13px] flex items-center gap-2 ${roomData.state === 'lobby' ? 'bg-[#F0EEFA] text-primary' : roomData.state === 'playing' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
          <span className={`w-2 h-2 rounded-full ${roomData.state === 'lobby' ? 'bg-[#10B981]' : roomData.state === 'playing' ? 'bg-orange-500' : 'bg-green-500'}`}></span> 
          {roomData.state === 'lobby' ? 'Lobby' : roomData.state === 'playing' ? 'Playing' : 'Finished'}
        </div>
      ) : <div className="w-[70px]"></div>}
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
