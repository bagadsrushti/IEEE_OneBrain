import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../SocketContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Swords, Plus, ArrowRight, Scan, X } from 'lucide-react';

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

  return <div id="reader" className="w-full bg-white text-[#1E1B3A] rounded-lg"></div>;
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
    if (!nickname.trim()) return setError('Nickname is required');
    createRoom(nickname.trim(), (res) => {
      if (res.error) return setError(res.error);
      navigate(`/room/${res.roomCode}`);
    });
  };

  const handleJoin = () => {
    if (!nickname.trim()) return setError('Nickname is required');
    if (!roomCode.trim()) return setError('Room code is required');
    joinRoom(roomCode.trim(), nickname.trim(), (res) => {
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
    <div className="w-full max-w-[400px] mx-auto px-2 pb-12 flex flex-col items-center z-10 relative">
      {/* Main Card */}
      <div className="bg-white rounded-[24px] border border-[#E9ECEF] shadow-[0_2px_16px_rgba(0,0,0,0.03)] p-6 sm:p-7 w-full space-y-6">
        
        {/* Header Icon + Titles */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center text-[#5046E5] mb-3">
            <Swords size={22} strokeWidth={2} />
          </div>
          <h2 className="text-[22px] font-bold text-[#1E1B3A] tracking-tight">Enter the Arena</h2>
          <p className="text-[13px] text-[#6B7280] mt-1 max-w-[270px] leading-relaxed">
            Challenge your friends. Find out who thinks fastest.
          </p>
        </div>

        {!isConnected && !connectionError && (
          <div className="text-center text-[#B45309] bg-[#FEF3C7] py-2 px-3 rounded-lg text-xs font-medium">
            Connecting to server...
          </div>
        )}
        {connectionError && (
          <div className="text-center text-[#DC2626] bg-[#FEF2F2] py-2 px-3 rounded-lg text-xs font-medium border border-[#FEE2E2]">
            {connectionError}
          </div>
        )}

        {/* Inputs & Actions */}
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#1E1B3A] mb-1.5">
              Nickname
            </label>
            <input
              type="text"
              placeholder="Your Name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={15}
              className="w-full bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[14px] font-medium text-[#1E1B3A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!isConnected}
            className="w-full py-3.5 bg-[#5046E5] hover:bg-[#4338CA] disabled:opacity-50 text-white font-semibold rounded-[12px] text-[15px] flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Create Room</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
            <span className="flex-shrink-0 mx-3 text-[#9CA3AF] text-[12px] font-medium">Or Join</span>
            <div className="flex-grow border-t border-[#E5E7EB]"></div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#1E1B3A] mb-1.5">
              Room code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="TN7KTU"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="flex-grow bg-white border border-[#E5E7EB] rounded-[12px] px-4 py-3 text-[15px] font-bold tracking-wider text-[#1E1B3A] placeholder-[#D1D5DB] focus:outline-none focus:border-[#5046E5] focus:ring-1 focus:ring-[#5046E5] transition-all uppercase"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="w-[46px] h-[46px] flex-shrink-0 flex items-center justify-center bg-white border border-[#E5E7EB] rounded-[12px] text-[#5046E5] hover:bg-[#F9FAFB] transition-colors"
                title="Scan QR Code"
              >
                <Scan size={20} strokeWidth={2} />
              </button>
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={!isConnected}
            className="w-full py-3.5 bg-white border-2 border-[#5046E5] hover:bg-[#EEF2FF]/40 disabled:opacity-50 text-[#5046E5] font-semibold rounded-[12px] text-[15px] flex items-center justify-center gap-2 transition-all"
          >
            <ArrowRight size={18} strokeWidth={2.5} />
            <span>Join Room</span>
          </button>
        </div>

        {error && (
          <div className="text-[#DC2626] text-center text-[13px] font-medium bg-[#FEF2F2] py-2 px-3 rounded-lg border border-[#FEE2E2]">
            {error}
          </div>
        )}
      </div>

      {/* Footer Text */}
      <div className="text-center mt-6 space-y-0.5">
        <div className="text-[13px] font-bold text-[#4B5563]">Better with your people.</div>
        <div className="text-[12px] text-[#9CA3AF]">3–8 players · One shared challenge</div>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-[#1E1B3A]/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-4 shadow-xl">
            <button 
              onClick={() => setShowScanner(false)}
              className="absolute -top-10 right-0 text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={26} />
            </button>
            <h3 className="text-center font-bold text-[#1E1B3A] mb-3">Scan Room QR Code</h3>
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] w-full">
              <QrScannerWrapper onScan={handleScan} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing;
