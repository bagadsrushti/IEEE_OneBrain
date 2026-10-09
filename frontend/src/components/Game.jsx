import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSocket } from '../SocketContext';
import { Send, Lightbulb, Clock, Check, X, AlertTriangle } from 'lucide-react';
import Button from './Button';

const Game = ({ room }) => {
  const { socket, myPlayerId } = useSocket();
  const [guess, setGuess] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  
  const isReady = room.state === 'ready';
  const isPlaying = room.state === 'playing';
  const isFinished = room.state === 'finished';

  useEffect(() => {
    let interval;
    const updateTimer = () => {
      const targetTime = isReady ? room.readyEndTime : room.roundEndTime;
      const remaining = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };
    
    updateTimer();
    interval = setInterval(updateTimer, 500); 
    
    return () => clearInterval(interval);
  }, [room.state, room.readyEndTime, room.roundEndTime]);

  useEffect(() => {
    if (isFinished && room.lastRoundSuccess) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6C4CF1', '#D94A2B', '#16A34A', '#E6E3F5']
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } else if (isFinished && !room.lastRoundSuccess) {
      if (navigator.vibrate) navigator.vibrate(500);
    }
  }, [isFinished, room.lastRoundSuccess]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!guess.trim()) return;
    
    socket.emit('submit_answer', { guess }, (res) => {
      if (res.error) {
        setErrorMsg(res.error);
        setGuess('');
        setTimeout(() => setErrorMsg(''), 3000);
      }
    });
  };

  const handleHint = () => {
    socket.emit('use_hint', (res) => {
      if (res.error) {
        setErrorMsg(res.error);
        setTimeout(() => setErrorMsg(''), 3000);
      }
    });
  };

  const handleNextRound = () => {
    socket.emit('next_round', () => {});
  };

  const isUrgent = isPlaying && timeRemaining <= 10;
  
  if (isReady) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center space-y-8">
        <h2 className="text-3xl text-text-muted font-bold">GET READY</h2>
        <div className="text-8xl font-bold font-mono text-primary">
          {timeRemaining}
        </div>
        <p className="text-text-muted font-medium">Read your clue carefully. Do not show your screen!</p>
      </div>
    );
  }

  if (isFinished) {
    const bd = room.lastRoundScoreBreakdown;
    
    return (
      <div className="w-full max-w-[440px] mx-auto flex flex-col space-y-6 mt-4">
        <div className={`bg-surface p-8 rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] text-center border-t-8 border-x border-b border-[#F3F4F6] ${room.lastRoundSuccess ? 'border-t-success' : 'border-t-danger'}`}>
          <div className="flex justify-center mb-4">
            {room.lastRoundSuccess ? (
              <div className="bg-success-bg p-4 rounded-full">
                <Check size={48} className="text-success" />
              </div>
            ) : (
              <div className="bg-danger-bg p-4 rounded-full">
                <X size={48} className="text-danger" />
              </div>
            )}
          </div>
          
          <h2 className="text-2xl font-bold mb-2 text-text">
            {room.lastRoundSuccess ? 'TEAM SUCCESS!' : 'ROUND OVER'}
          </h2>
          <p className="text-text-muted mb-6 font-medium">{room.lastRoundReason}</p>
          
          <div className="text-sm text-text-muted uppercase tracking-widest font-bold">The Answer Was</div>
          <div className="text-3xl font-black text-primary mb-6">
            {room.challenge?.answer}
          </div>

          <div className="text-left bg-bg p-4 rounded-[14px] border border-border mb-6 space-y-2 text-sm text-text font-medium">
            <div className="flex justify-between">
              <span>Base Score</span>
              <span className="font-bold text-success">{bd?.baseScore > 0 ? `+${bd.baseScore}` : '0'}</span>
            </div>
            <div className="flex justify-between">
              <span>Time Bonus</span>
              <span className="font-bold text-success">{bd?.timeBonus > 0 ? `+${bd.timeBonus}` : '0'}</span>
            </div>
            <div className="flex justify-between">
              <span>Hint Penalty</span>
              <span className="font-bold text-danger">{bd?.hintPenalty}</span>
            </div>
            <div className="flex justify-between">
              <span>Wrong Penalty</span>
              <span className="font-bold text-danger">{bd?.wrongPenalty}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-bold">
              <span>Multiplier</span>
              <span className="text-primary">x {bd?.multiplier}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-border">
              <span className="text-text font-bold">Round Earned</span>
              <span className={`font-bold ${bd?.finalScore > 0 ? 'text-success' : 'text-text-muted'}`}>
                +{bd?.finalScore}
              </span>
            </div>
            <div className="flex justify-between text-xl font-bold text-text pt-2 border-t border-border">
              <span>Total Score</span>
              <span className="text-primary">{room.score}</span>
            </div>
          </div>
          
          {room.host === myPlayerId && (
            <Button
              onClick={handleNextRound}
              variant="accent"
              className="w-full py-4 rounded-[16px] font-bold text-[16px] shadow-md"
            >
              PLAY AGAIN
            </Button>
          )}
          {room.host !== myPlayerId && (
            <div className="text-text-muted font-medium animate-pulse">Waiting for host...</div>
          )}
        </div>

        <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-[#F3F4F6] p-6">
          <h3 className="text-xl font-bold mb-4 border-b border-border pb-2 text-text">All Clues Revealed</h3>
          <ul className="space-y-4">
            {room.allClues?.map((c, i) => (
              <li key={i} className="bg-bg p-4 rounded-[14px] border-l-4 border-l-primary border-t border-r border-b border-border shadow-sm">
                <div className="text-sm text-primary font-bold mb-1 flex items-center gap-2">
                  <Lightbulb size={14} /> {c.name}'s Clue
                </div>
                <div className="text-text font-medium text-lg leading-relaxed">{c.clue}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Determine badge colors dynamically but safely
  const badgeHex = room.categoryMeta?.color || '#6C4CF1';

  return (
    <div className={`flex flex-col h-full w-full max-w-[440px] mx-auto transition-colors duration-500 z-10 relative ${isUrgent ? 'bg-danger-bg rounded-[24px] p-4' : ''}`}>
      {/* Header Info */}
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex flex-col items-start">
          <span className="text-xs text-text-muted font-bold uppercase tracking-widest mb-1">Category</span>
          <span 
            className="px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] shadow-sm border border-black/5"
            style={{ backgroundColor: `${badgeHex}20`, color: badgeHex }}
          >
            {room.categoryMeta?.emoji} {room.category}
          </span>
        </div>
        
        <div className="flex flex-col items-center">
          <div className={`flex items-center space-x-2 text-4xl font-mono font-black transition-colors duration-300 ${isUrgent ? 'text-danger' : 'text-accent'}`}>
            <Clock size={28} className={isUrgent ? 'animate-bounce' : ''} />
            <span>{timeRemaining}</span>
          </div>
          <div className="w-full bg-border h-2 mt-2 rounded-full overflow-hidden">
             <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(timeRemaining / (room.roundRules?.roundSeconds || 120)) * 100}%` }}></div>
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xs text-text-muted font-bold uppercase tracking-widest mb-1">Score</span>
          <span className="font-bold text-success text-2xl">{room.score}</span>
        </div>
      </div>

      {/* Main Clue Area */}
      <div className="bg-surface rounded-[24px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-8 mb-6 flex-grow flex flex-col justify-center items-center text-center relative overflow-hidden border border-[#F3F4F6] border-l-8 border-l-primary/60">
        
        <div className="text-sm text-primary font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
           Your Private Clue
        </div>
        <p className="text-[22px] md:text-3xl font-semibold text-text leading-relaxed">
          {room.myClue}
        </p>
        
        {room.sharedHint && (
          <div className="mt-8 p-4 bg-hint-bg border border-yellow-200 rounded-[14px] w-full">
            <div className="text-xs text-hint font-bold uppercase tracking-widest mb-2 flex justify-center items-center">
              <Lightbulb size={16} className="mr-1" /> Shared Hint
            </div>
            <p className="text-hint font-medium text-lg">{room.sharedHint}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <AnimatePresence>
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-danger-bg text-danger p-3 rounded-[14px] flex items-center justify-center space-x-2 border border-red-200 font-medium shadow-sm"
            >
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Enter Team Answer..."
            className="flex-grow bg-white border border-[#E5E7EB] rounded-[16px] p-4 text-[16px] font-semibold text-[#1E1B3A] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
          />
          <Button 
            type="submit"
            variant="primary"
            className="w-16 rounded-[16px] h-auto p-0 flex items-center justify-center shadow-[0_8px_20px_rgba(108,76,241,0.25)]"
          >
            <Send size={24} />
          </Button>
        </form>
        
        <div className="flex justify-between items-center px-2">
          <Button 
            onClick={handleHint}
            disabled={room.hintsUsed >= (room.roundRules?.maxHints || 0)}
            variant="hint"
            className="px-4 py-2 h-10 min-h-0 text-[13px] font-bold shadow-sm rounded-[12px]"
          >
            <Lightbulb size={16} className="mr-1" />
            <span>{room.hintsUsed >= (room.roundRules?.maxHints || 0) ? 'Max Hints Used' : `Use Hint (-${room.roundRules?.hintPenalty || 0} pts)`}</span>
          </Button>
          
          <div className="text-sm font-bold text-text-muted flex items-center gap-1 bg-surface border border-border px-3 py-2 rounded-[12px] shadow-sm">
            <X size={14} className="text-danger" /> 
            Attempts: {room.wrongAttempts}/{room.roundRules?.maxAttempts || 3}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
