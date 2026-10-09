import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';
import Button from '../components/Button';

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

  return <div id="reader" className="w-full bg-surface text-text rounded-lg"></div>;
};

const Landing = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { createRoom, joinRoom, isConnected, connectionError } = useSocket();
  
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState((code || '').toUpperCase());
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (code) {
      setRoomCode(code.toUpperCase());
    }
  }, [code]);

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
      const text = resultText.trim();
      const match = text.match(/(?:\/join\/|\/room\/|[?&]code=)([a-zA-Z0-9]{6})/i);
      if (match) {
        setRoomCode(match[1].toUpperCase());
        setShowScanner(false);
      } else if (/^[a-zA-Z0-9]{6}$/.test(text)) {
        setRoomCode(text.toUpperCase());
        setShowScanner(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center max-w-[440px] w-full mx-auto space-y-6 mt-4 pb-12 z-10 relative">
      <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-8 w-full space-y-6 border border-[#F3F4F6]">
        <h2 className="text-[20px] font-bold text-center mb-2 text-[#1E1B3A]">Enter the Arena</h2>
        
        {!isConnected && !connectionError && <div className="text-center text-hint font-medium">Connecting to server...</div>}
        {connectionError && <div className="text-center text-danger font-medium p-3 bg-danger-bg rounded-lg border border-red-200">{connectionError}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-[13px] text-text-muted mb-2 font-bold tracking-widest uppercase">Nickname</label>
            <input
              type="text"
              className="w-full bg-white border border-[#E5E7EB] rounded-[16px] p-4 text-[16px] font-semibold text-[#1E1B3A] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              placeholder="Your Name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={12}
            />
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              onClick={handleCreate}
              disabled={!isConnected}
              className="w-full py-4 rounded-[16px] font-bold text-[16px] shadow-[0_8px_20px_rgba(108,76,241,0.25)]"
              variant="primary"
            >
              CREATE ROOM
            </Button>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
            <span className="flex-shrink-0 mx-4 text-[#9CA3AF] text-sm font-medium">OR JOIN</span>
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
          </div>

          <div>
            <label className="block text-[13px] text-text-muted mb-2 font-bold tracking-widest uppercase">Room Code</label>
            <div className="flex space-x-2">
              <input
                type="text"
                className="flex-grow bg-white border border-[#E5E7EB] rounded-[16px] p-4 text-[16px] font-semibold text-[#1E1B3A] text-center uppercase tracking-widest focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent shadow-sm"
                placeholder="6 CHARS"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <Button 
                onClick={() => setShowScanner(true)}
                variant="secondary"
                className="px-4 rounded-[16px] border-[#E5E7EB] bg-[#F8F9FB] hover:bg-[#F3F4F6]"
              >
                <Camera size={24} className="text-text-muted" />
              </Button>
            </div>
          </div>

          <Button
            onClick={handleJoin}
            disabled={!isConnected}
            className="w-full py-4 rounded-[16px] font-bold text-[16px] shadow-md"
            variant="accent"
          >
            JOIN ROOM
          </Button>
        </div>

        {error && <div className="text-danger text-center text-sm font-medium">{error}</div>}
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-text/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm">
            <button 
              onClick={() => setShowScanner(false)}
              className="absolute -top-12 right-0 text-surface z-50 p-2 hover:bg-surface/10 rounded-full transition-colors"
            >
              <X size={32} />
            </button>
            <div className="bg-surface rounded-2xl overflow-hidden border-2 border-primary w-full relative">
              <QrScannerWrapper onScan={handleScan} />
            </div>
            <p className="text-center text-surface mt-4 font-medium">Scan Room QR Code</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing;
