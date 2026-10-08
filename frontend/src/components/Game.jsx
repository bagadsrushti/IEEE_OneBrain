import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSocket } from '../SocketContext';
import { Send, Lightbulb, Clock, Check, X, AlertTriangle } from 'lucide-react';

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
        origin: { y: 0.6 }
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
        <h2 className="text-3xl text-gray-400 font-bold">GET READY</h2>
        <div className="text-8xl font-bold font-mono text-white">
          {timeRemaining}
        </div>
        <p className="text-gray-400">Read your clue carefully. Do not show your screen!</p>
      </div>
    );
  }

  if (isFinished) {
    const bd = room.lastRoundScoreBreakdown;
    
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col space-y-6 mt-8">
        <div className={`glass-panel p-8 rounded-2xl text-center border-t-8 ${room.lastRoundSuccess ? 'border-green-500' : 'border-red-500'}`}>
          <div className="flex justify-center mb-4">
            {room.lastRoundSuccess ? (
              <div className="bg-green-500/20 p-4 rounded-full">
                <Check size={48} className="text-green-500" />
              </div>
            ) : (
              <div className="bg-red-500/20 p-4 rounded-full">
                <X size={48} className="text-red-500" />
              </div>
            )}
          </div>
          
          <h2 className="text-2xl font-bold mb-2">
            {room.lastRoundSuccess ? 'TEAM SUCCESS!' : 'ROUND OVER'}
          </h2>
          <p className="text-gray-400 mb-6">{room.lastRoundReason}</p>
          
          <div className="text-sm text-gray-400 uppercase tracking-widest">The Answer Was</div>
          <div className="text-3xl font-bold text-white neon-text mb-6">
            {room.challenge?.answer}
          </div>

          <div className="text-left bg-gray-900 p-4 rounded-xl mb-6 space-y-2 text-sm text-gray-300">
            <div className="flex justify-between">
              <span>Base Score</span>
              <span className="font-bold text-green-400">{bd?.baseScore > 0 ? `+${bd.baseScore}` : '0'}</span>
            </div>
            <div className="flex justify-between">
              <span>Time Bonus</span>
              <span className="font-bold text-green-400">{bd?.timeBonus > 0 ? `+${bd.timeBonus}` : '0'}</span>
            </div>
            <div className="flex justify-between">
              <span>Hint Penalty</span>
              <span className="font-bold text-red-400">{bd?.hintPenalty}</span>
            </div>
            <div className="flex justify-between">
              <span>Wrong Penalty</span>
              <span className="font-bold text-red-400">{bd?.wrongPenalty}</span>
            </div>
            <div className="flex justify-between border-t border-gray-700 pt-2 font-bold">
              <span>Multiplier</span>
              <span className="text-blue-400">x {bd?.multiplier}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-gray-700">
              <span className="text-white">Round Earned</span>
              <span className={`font-bold ${bd?.finalScore > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                +{bd?.finalScore}
              </span>
            </div>
            <div className="flex justify-between text-xl font-bold text-white pt-2 border-t border-gray-700">
              <span>Total Score</span>
              <span className="text-blue-400">{room.score}</span>
            </div>
          </div>
          
          {room.host === myPlayerId && (
            <button
              onClick={handleNextRound}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg text-lg"
            >
              PLAY AGAIN
            </button>
          )}
          {room.host !== myPlayerId && (
            <div className="text-gray-500 animate-pulse">Waiting for host...</div>
          )}
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">All Clues Revealed</h3>
          <ul className="space-y-4">
            {room.allClues?.map((c, i) => (
              <li key={i} className="bg-gray-900 p-4 rounded-xl border border-gray-700">
                <div className="text-sm text-blue-400 font-bold mb-1">{c.name}'s Clue</div>
                <div className="text-gray-200">{c.clue}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full w-full max-w-lg mx-auto ${isUrgent ? 'animate-pulse' : ''}`}>
      {/* Header Info */}
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500 uppercase tracking-widest mb-1">Category</span>
          <span 
            className="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]"
            style={{ backgroundColor: room.categoryMeta?.color ? `${room.categoryMeta.color}33` : '#333', color: room.categoryMeta?.color || '#fff' }}
          >
            {room.categoryMeta?.emoji} {room.category}
          </span>
        </div>
        
        <div className={`flex items-center space-x-2 text-3xl font-mono font-bold ${isUrgent ? 'text-red-500 neon-text-red' : 'text-white'}`}>
          <Clock size={24} className={isUrgent ? 'animate-bounce' : ''} />
          <span>{timeRemaining}</span>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500 uppercase tracking-widest">Score</span>
          <span className="font-bold text-green-400 text-xl">{room.score}</span>
        </div>
      </div>

      {/* Main Clue Area */}
      <div className="glass-panel rounded-3xl p-8 mb-6 flex-grow flex flex-col justify-center items-center text-center relative overflow-hidden">
        {isUrgent && <div className="absolute inset-0 border-4 border-red-500/50 rounded-3xl pointer-events-none"></div>}
        
        <div className="text-sm text-blue-400 font-bold uppercase tracking-widest mb-6">Your Private Clue</div>
        <p className="text-2xl md:text-3xl font-medium text-white leading-relaxed">
          {room.myClue}
        </p>
        
        {room.sharedHint && (
          <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl w-full">
            <div className="text-xs text-yellow-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center">
              <Lightbulb size={14} className="mr-1" /> Shared Hint
            </div>
            <p className="text-gray-200">{room.sharedHint}</p>
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
              className="bg-red-500/20 text-red-400 p-3 rounded-lg flex items-center justify-center space-x-2 border border-red-500/50"
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
            className="flex-grow bg-gray-900 border border-gray-700 rounded-xl p-4 text-lg focus:outline-none focus:border-blue-500 text-white"
          />
          <button 
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl flex items-center justify-center min-w-[60px]"
          >
            <Send size={24} />
          </button>
        </form>
        
        <div className="flex justify-between items-center px-2">
          <button 
            onClick={handleHint}
            disabled={room.hintsUsed >= (room.roundRules?.maxHints || 0)}
            className="text-yellow-500 flex items-center space-x-1 text-sm font-bold hover:text-yellow-400 disabled:opacity-50"
          >
            <Lightbulb size={16} />
            <span>{room.hintsUsed >= (room.roundRules?.maxHints || 0) ? 'Max Hints Used' : `Use Hint (-${room.roundRules?.hintPenalty || 0} pts)`}</span>
          </button>
          
          <div className="text-sm text-gray-500">
            Attempts: {room.wrongAttempts}/{room.roundRules?.maxAttempts || 3}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
