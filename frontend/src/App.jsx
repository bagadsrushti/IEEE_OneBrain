import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './SocketContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col font-sans overflow-x-hidden">
          <header className="p-4 border-b border-gray-800 text-center">
            <h1 className="text-3xl font-bold tracking-wider text-blue-400 neon-text">
              ONE BRAIN
            </h1>
          </header>
          
          <main className="flex-grow flex flex-col relative">
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
