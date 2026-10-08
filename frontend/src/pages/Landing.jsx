import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

const QrScannerWrapper = ({ onScan }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', { qrbox: { width: 250, height: 250 }, fps: 5 }, false);
    scanner.render(
      (text) => {
        scanner.clear();
        onScan(text);
      },
      (err) => {}
    );
    return () => {
      scanner.clear().catch(e => console.error(e));
    };
  }, [onScan]);

  return <div id="reader" className="w-full bg-white text-black"></div>;
};

const Landing = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { createRoom, joinRoom, isConnected } = useSocket();
  
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(code || '');
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const handleCreate = () => {
    if (!nickname) return setError('Nickname is required');
    createRoom(nickname, (res) => {
      if (res.error) return setError(res.error);
      navigate(`/room/${res.roomCode}`);
    });
  };

  const handleJoin = () => {
    if (!nickname) return setError('Nickname is required');
    if (!roomCode) return setError('Room code is required');
    joinRoom(roomCode, nickname, (res) => {
      if (res.error) return setError(res.error);
      navigate(`/room/${res.roomCode}`);
    });
  };

  const handleScan = (resultText) => {
    if (resultText) {
      const match = resultText.match(/\/join\/([a-zA-Z0-9]{6})/i);
      if (match) {
        setRoomCode(match[1].toUpperCase());
        setShowScanner(false);
      }
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl p-8 max-w-sm w-full space-y-6">
        <h2 className="text-2xl font-bold text-center mb-6">Enter the Arena</h2>
        
        {!isConnected && <div className="text-center text-yellow-400">Connecting to server...</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nickname</label>
            <input
              type="text"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-lg focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Your Name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={12}
            />
          </div>

          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={handleCreate}
              disabled={!isConnected}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)] transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              CREATE ROOM
            </button>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-gray-700"></div>
            <span className="flex-shrink-0 mx-4 text-gray-500 text-sm">OR JOIN</span>
            <div className="flex-grow border-t border-gray-700"></div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Room Code</label>
            <div className="flex space-x-2">
              <input
                type="text"
                className="flex-grow bg-gray-900 border border-gray-700 rounded-lg p-3 text-lg text-center uppercase tracking-widest focus:outline-none focus:border-green-500 transition-colors"
                placeholder="6 CHARS"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button 
                onClick={() => setShowScanner(true)}
                className="bg-gray-800 border border-gray-700 p-3 rounded-lg hover:bg-gray-700"
              >
                <Camera size={24} className="text-gray-300" />
              </button>
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={!isConnected}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            JOIN ROOM
          </button>
        </div>

        {error && <div className="text-red-400 text-center text-sm">{error}</div>}
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm">
            <button 
              onClick={() => setShowScanner(false)}
              className="absolute -top-12 right-0 text-white z-50"
            >
              <X size={32} />
            </button>
            <div className="bg-gray-900 rounded-lg overflow-hidden border-2 border-blue-500 w-full relative">
              <QrScannerWrapper onScan={handleScan} />
            </div>
            <p className="text-center text-gray-400 mt-4">Scan Room QR Code</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing;
