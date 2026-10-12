import { useState } from 'react';
import QRCode from 'react-qr-code';
import { getPublicUrl } from '../config';

export default function InviteCard({ roomCode, label = 'Room code', shareText }) {
  const [copied, setCopied] = useState(false);
  const [showSelectableLink, setShowSelectableLink] = useState(false);

  // NEVER use window.location.origin - always use getPublicUrl()
  const inviteLink = `${getPublicUrl()}/join/${roomCode}`;

  const copyToClipboard = async (text) => {
    try {
      // Try modern clipboard API first
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback to execCommand
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        let success = false;
        try {
          textarea.select();
          success = document.execCommand('copy');
        } finally {
          textarea.remove();
        }
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          throw new Error('execCommand failed');
        }
      } catch {
        // Both failed, show selectable text box
        setShowSelectableLink(true);
      }
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join One Brain',
          text: shareText || `Join my game on One Brain`,
          url: inviteLink,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* QR Code with quiet zone (MEDIUM-2 FIX - 24px padding = ~4 modules) */}
      <div className="flex justify-center">
        <div className="bg-white p-6 rounded-lg inline-block shadow-sm">
          <QRCode
            value={inviteLink}
            size={150}
            fgColor="#1E1B3A"
            bgColor="#FFFFFF"
          />
        </div>
      </div>

      {/* Room Code Display */}
      <div className="text-center">
        <p className="text-sm text-gray-600 mb-1">{label}</p>
        <p className="text-3xl font-bold tracking-wider">{roomCode}</p>
      </div>

      {/* Copy Button */}
      <button
        onClick={() => copyToClipboard(inviteLink)}
        className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
      >
        {copied ? 'Link Copied!' : 'Copy Invite Link'}
      </button>

      {/* Share Button (if available) */}
      {navigator.share && (
        <button
          onClick={handleShare}
          className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
          Share Invite
        </button>
      )}

      {/* Selectable Link Fallback */}
      {showSelectableLink && (
        <div className="mt-2 p-3 bg-gray-50 rounded border">
          <label className="text-gray-600 block mb-2 text-sm">
            Copy failed. Select the link manually:
          </label>
          <input
            type="text"
            value={inviteLink}
            readOnly
            className="w-full px-3 py-2 border rounded text-sm font-mono bg-white"
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}
    </div>
  );
}
