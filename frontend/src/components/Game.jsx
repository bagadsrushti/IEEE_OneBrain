import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSocket } from '../SocketContext';
import { Send, Lightbulb, Clock, Check, X, AlertTriangle, ArrowRight, Trophy, Award, Zap, ChevronRight, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';

const Game = ({ room }) => {
  const navigate = useNavigate();
  const { socket, myPlayerId, duelAudience, clockOffset } = useSocket();
  const [guess, setGuess] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Progressive Clue Release States
  const [nextClueCountdown, setNextClueCountdown] = useState(0);
  const [newClueArrived, setNewClueArrived] = useState(false);
  const prevClueCountRef = React.useRef(0);
  
  const isEvent = room.mode === 'event';
  const isDuel = room.mode === 'duel_team' || !!room.duelInfo;
  const duelInfo = room.duelInfo;
  const opponentSolved = duelInfo?.myTeamKey === 'red'
    ? duelAudience?.teamBlue?.solvedCount
    : duelAudience?.teamRed?.solvedCount;
  const opponentSolvedCount = opponentSolved ?? duelInfo?.opponentSolvedCount ?? 0;
  const isReady = room.state === 'ready';
  const isPlaying = room.state === 'playing';
  const isReveal = room.state === 'reveal';
  const isEventFinished = room.state === 'event_finished';
  const isDuelFinished = isDuel && (room.state === 'finished' || duelInfo?.status === 'finished');
  const isFinished = room.state === 'finished' && !isDuel; // Quick Play only

  const cluesList = room.myClues && room.myClues.length > 0
    ? room.myClues
    : (room.myClue ? [{ index: 1, text: room.myClue }] : []);

  // Detect new clue arrival, trigger gentle highlight & haptic
  useEffect(() => {
    if (cluesList.length > prevClueCountRef.current && prevClueCountRef.current > 0) {
      if (navigator.vibrate) {
        try { navigator.vibrate([50, 50, 50]); } catch (e) {}
      }
      setNewClueArrived(true);
      const timer = setTimeout(() => setNewClueArrived(false), 3000);
      return () => clearTimeout(timer);
    }
    prevClueCountRef.current = cluesList.length;
  }, [cluesList.length]);

  // Socket listener for new_clue event
  useEffect(() => {
    if (!socket) return;
    const handleNewClue = () => {
      if (navigator.vibrate) {
        try { navigator.vibrate([50, 50, 50]); } catch (e) {}
      }
      setNewClueArrived(true);
      setTimeout(() => setNewClueArrived(false), 3000);
    };
    socket.on('new_clue', handleNewClue);
    return () => socket.off('new_clue', handleNewClue);
  }, [socket]);

  // Next clue countdown
  useEffect(() => {
    if (!room.hasMoreClues || !room.nextWaveAt || !isPlaying) {
      setNextClueCountdown(0);
      return;
    }
    const updateNextClueTimer = () => {
      const remaining = Math.max(0, Math.ceil((room.nextWaveAt - Date.now() - (isDuel ? clockOffset : 0)) / 1000));
      setNextClueCountdown(remaining);
    };
    updateNextClueTimer();
    const interval = setInterval(updateNextClueTimer, 500);
    return () => clearInterval(interval);
  }, [room.hasMoreClues, room.nextWaveAt, isPlaying, isDuel, clockOffset]);

  useEffect(() => {
    let interval;
    const updateTimer = () => {
      let targetTime;
      if (isReady) targetTime = room.readyEndTime;
      else if (isReveal) targetTime = room.revealEndTime;
      else targetTime = room.roundEndTime;

      const remaining = Math.max(0, Math.floor((targetTime - Date.now() - (isDuel ? clockOffset : 0)) / 1000));
      setTimeRemaining(remaining);
    };
    
    updateTimer();
    interval = setInterval(updateTimer, 500); 
    
    return () => clearInterval(interval);
  }, [room.state, room.readyEndTime, room.roundEndTime, room.revealEndTime, isDuel, clockOffset]);

  // Confetti on win
  useEffect(() => {
    if (isDuelFinished && duelInfo?.winner) {
      confetti({
        particleCount: 130,
        spread: 80,
        origin: { y: 0.6 },
        colors: duelInfo.winner === duelInfo.myTeamKey ? ['#16A34A', '#5046E5', '#F59E0B'] : ['#6C4CF1', '#9CA3AF']
      });
      if (navigator.vibrate) navigator.vibrate([150, 100, 150]);
    } else if ((isFinished && room.lastRoundSuccess) || (isEventFinished && room.eventFinalResult?.roundsSolved > 0)) {
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
  }, [isDuelFinished, isFinished, isEventFinished, room.lastRoundSuccess, duelInfo]);

  // Auto-clear answer input on next round, round transition, or state change
  useEffect(() => {
    setGuess('');
    setErrorMsg('');
  }, [
    room.currentRound,
    duelInfo?.currentRound,
    room.roundPlayStartTime,
    room.roundEndTime,
    room.state
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!guess.trim()) return;
    
    const submittedGuess = guess;
    setGuess('');
    
    socket.emit('submit_answer', { guess: submittedGuess }, (res) => {
      if (res?.error) {
        setErrorMsg(res.error);
        setTimeout(() => setErrorMsg(''), 3000);
      } else if (res?.isCorrect === false) {
        setErrorMsg('Incorrect answer');
        setTimeout(() => setErrorMsg(''), 3000);
      }
    });
  };

  const handleHint = () => {
    socket.emit('use_hint', (res) => {
      if (res?.error) {
        setErrorMsg(res.error);
        setTimeout(() => setErrorMsg(''), 3000);
      }
    });
  };

  const handleNextRound = () => {
    setGuess('');
    socket.emit('next_round', () => {});
  };

  const handleSkipWord = () => {
    setGuess('');
    socket.emit('skip_word', (res) => {
      if (res?.error) {
        setErrorMsg(res.error);
        setTimeout(() => setErrorMsg(''), 3000);
      }
    });
  };

  const isUrgent = isPlaying && timeRemaining <= 10;

  useEffect(() => {
    if (!isDuel || !duelInfo?.startTime) return;
    const update = () => setMatchElapsed(Math.max(0, Math.floor((Date.now() + clockOffset - duelInfo.startTime) / 1000)));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [isDuel, duelInfo?.startTime, clockOffset]);
  
  // 1. PREP / READY SCREEN
  if (isReady) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center space-y-6 text-center max-w-[400px] mx-auto px-4">
        {isEvent && (
          <div className="px-3 py-1 bg-[#EEF2FF] text-[#5046E5] rounded-full text-[13px] font-bold border border-[#E0E7FF]">
            Round {room.currentRound || 1} of 3
          </div>
        )}
        <h2 className="text-3xl text-text-muted font-bold tracking-tight">GET READY</h2>
        <div className="text-8xl font-bold font-mono text-[#5046E5] animate-pulse">
          {timeRemaining}
        </div>
        <p className="text-[#6B7280] font-medium text-[14px] leading-relaxed">
          Read your individual clue carefully.<br />
          <strong className="text-[#1E1B3A]">Talk to your teammates</strong> — combine clues to find the answer!
        </p>

        {/* Team Members Distribution */}
        {room.players && room.players.length > 0 && (
          <div className="w-full bg-white/90 border border-[#E5E7EB] rounded-2xl p-3.5 shadow-2xs">
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2">
              Team Roster ({room.players.filter(p => p.connected).length} Players)
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {room.players.filter(p => p.connected).map(p => (
                <span
                  key={p.id}
                  className={`px-3 py-1 rounded-xl text-[12px] font-bold ${
                    p.id === myPlayerId
                      ? 'bg-[#EEF2FF] text-[#5046E5] ring-1 ring-[#5046E5]/40'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.name} {p.id === myPlayerId && '(You)'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. 6-SECOND REVEAL SCREEN (EVENT MODE)
  if (isReveal && room.revealData) {
    const rev = room.revealData;
    return (
      <div className="w-full max-w-[420px] mx-auto flex flex-col items-center mt-2 px-2 pb-8 space-y-4">
        {/* Top Header */}
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-xs ${
            rev.solved ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#FEF2F2] text-[#DC2626]'
          }`}>
            {rev.solved ? <Check size={26} strokeWidth={2.5} /> : <X size={26} strokeWidth={2.5} />}
          </div>
          <div className="text-[12px] font-bold text-[#5046E5] uppercase tracking-wider">
            Round {rev.roundNum} of {rev.totalRounds} · Reveal
          </div>
          <h2 className="text-[22px] font-extrabold text-[#1E1B3A] tracking-tight">
            {rev.solved ? 'Round Solved!' : 'Round Time-Out'}
          </h2>
          <div className="text-[12px] font-semibold text-[#6B7280] mt-0.5">
            Round Time: <span className="font-bold text-[#1E1B3A]">{rev.roundTime}s</span>
            {rev.wrongAttempts > 0 && ` (+${rev.wrongAttempts * 5}s wrong)`}
            {rev.hintsUsed > 0 && ` (+${rev.hintsUsed * 10}s hint)`}
          </div>
        </div>

        {/* Answer Revealed Card */}
        <div className="w-full bg-white rounded-[22px] border border-[#E9ECEF] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-center space-y-2">
          <div className="text-[11px] font-bold tracking-widest text-[#9CA3AF] uppercase">
            THE ANSWER WAS
          </div>
          <div className="text-[26px] font-black text-[#1E1B3A] tracking-tight capitalize leading-tight">
            {rev.answer}
          </div>
          {rev.currentRank && (
            <div className="pt-2 border-t border-[#F3F4F6] flex justify-between items-center text-[13px]">
              <span className="text-[#6B7280]">Current Live Standing</span>
              <span className="font-extrabold text-[#5046E5]">#{rev.currentRank}</span>
            </div>
          )}
        </div>

        {/* Next Round Countdown Progress */}
        <div className="w-full bg-[#EEF2FF] border border-[#E0E7FF] rounded-[16px] p-3 text-center flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#5046E5] text-[13px] font-bold">
            <Clock size={16} />
            <span>Next round starts in {timeRemaining}s</span>
          </div>
          <span className="text-[11px] font-medium text-[#6B7280]">Auto-advancing...</span>
        </div>

        {/* All Clues Revealed */}
        {rev.allClues && rev.allClues.length > 0 && (
          <div className="w-full space-y-2 text-left pt-2">
            <h3 className="text-[14px] font-bold text-[#1E1B3A]">
              Teammate Clues Revealed
            </h3>
            <div className="space-y-2">
              {rev.allClues.map((c, i) => (
                <div
                  key={i}
                  className="bg-white rounded-[14px] border border-[#E9ECEF] p-3 text-left shadow-xs space-y-1"
                >
                  <div className="text-[11px] font-bold text-[#5046E5] flex items-center gap-1.5">
                    <Lightbulb size={13} />
                    <span>{c.name}</span>
                  </div>
                  <div className="text-[13px] text-[#4B5563] leading-relaxed">
                    {c.clue}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. FINAL RESULTS SCREEN (EVENT MODE)
  if (isEventFinished && room.eventFinalResult) {
    const res = room.eventFinalResult;
    return (
      <div className="w-full max-w-[420px] mx-auto flex flex-col items-center mt-2 px-2 pb-12 space-y-4 text-center">
        {/* Finish Trophy */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#FEF3C7] to-[#FDE68A] text-[#D97706] flex items-center justify-center shadow-sm">
          <Trophy size={32} strokeWidth={2} />
        </div>

        <div>
          <div className="text-[12px] font-bold text-[#5046E5] uppercase tracking-wider">
            Race Completed · 3 of 3 Rounds
          </div>
          <h2 className="text-[26px] font-black text-[#1E1B3A] tracking-tight">
            {res.teamName || 'Your Team'}
          </h2>
          <p className="text-[14px] text-[#6B7280] mt-0.5">
            {res.gap || 'Great team coordination!'}
          </p>
        </div>

        {/* Rank & Total Time Card */}
        <div className="w-full bg-white rounded-[22px] border border-[#E9ECEF] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex justify-around items-center border-b border-[#F3F4F6] pb-4">
            <div>
              <div className="text-[11px] font-bold text-[#9CA3AF] uppercase">Final Rank</div>
              <div className="text-[36px] font-black text-[#5046E5] leading-tight">
                #{res.rank || 1}
              </div>
            </div>
            <div className="w-[1px] h-10 bg-[#E5E7EB]"></div>
            <div>
              <div className="text-[11px] font-bold text-[#9CA3AF] uppercase">Total Time</div>
              <div className="text-[36px] font-black text-[#1E1B3A] font-mono leading-tight">
                {res.totalTimeFormatted || `${res.totalTime}s`}
              </div>
            </div>
          </div>

          {/* Badges Earned */}
          {res.badges && res.badges.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-[#9CA3AF] uppercase text-left">
                Badges Earned
              </div>
              <div className="flex flex-wrap gap-2">
                {res.badges.map(b => (
                  <span
                    key={b}
                    className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] text-[12px] font-bold flex items-center gap-1"
                  >
                    <Award size={13} />
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Per-Round Breakdown Table */}
          <div className="space-y-2 pt-2 text-left">
            <div className="text-[11px] font-bold text-[#9CA3AF] uppercase">
              Round Breakdown
            </div>
            <div className="space-y-1.5">
              {(res.rounds || []).map((r, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-[12px] bg-[#F9FAFB] border border-[#F3F4F6] flex justify-between items-center text-[13px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1E1B3A]">Round {r.roundNum}</span>
                    <span className="text-[#6B7280] text-[12px]">({r.answer})</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className={`font-bold ${r.solved ? 'text-[#10B981]' : 'text-[#DC2626]'}`}>
                      {r.roundTime}s
                    </span>
                    {r.solved ? <Check size={14} className="text-[#10B981]" /> : <X size={14} className="text-[#DC2626]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#F3F4F6] flex justify-between text-[12px] text-[#6B7280]">
            <span>Rounds Solved: <strong className="text-[#1E1B3A]">{res.roundsSolved}/3</strong></span>
            <span>Penalties: <strong className="text-[#1E1B3A]">{res.totalWrong * 5 + res.totalHints * 10}s</strong></span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2.5 pt-2">
          <button
            onClick={() => navigate('/leaderboard')}
            className="w-full py-3.5 px-4 bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold rounded-[14px] flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <BarChart2 size={18} />
            <span>View Live Projector Leaderboard</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 px-4 bg-white hover:bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] font-semibold rounded-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  // 3a. WAITING FOR OPPONENT SCREEN (DUEL MODE)
  if (isDuel && duelInfo?.waitingForOpponent && !isDuelFinished) {
    return (
      <div className="w-full max-w-[420px] mx-auto flex flex-col items-center mt-6 px-4 space-y-5 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 animate-pulse shadow-sm">
          <Clock size={32} />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Round 3 Completed</span>
          <h2 className="text-2xl font-black text-[#1E1B3A]">Finished, waiting for the other team...</h2>
          <p className="text-sm text-gray-500 max-w-[340px] mx-auto">
            Your team finished all 3 rounds ({duelInfo.mySolvedCount || 0}/3 solved). Waiting for {duelInfo.opponentTeamName} to conclude...
          </p>
        </div>

        <div className="w-full bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3.5 text-left">
          <div className="flex justify-between items-center text-sm font-bold">
            <span className="text-gray-800">{duelInfo.myTeamName} (You)</span>
            <span className="text-emerald-600 font-mono font-black">{duelInfo.mySolvedCount || 0}/3 Solved</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${((duelInfo.mySolvedCount || 0) / 3) * 100}%` }}></div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-sm font-bold">
            <span className="text-gray-600">{duelInfo.opponentTeamName}</span>
            <span className="text-indigo-600 font-mono font-black">{opponentSolvedCount}/3 Solved</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${(opponentSolvedCount / 3) * 100}%` }}></div>
          </div>
        </div>
      </div>
    );
  }

  // 3b. DUEL MODE VICTORY & RECAP SCREEN
  if (isDuelFinished && duelInfo) {
    const isWinner = duelInfo.winner === duelInfo.myTeamKey;
    const isDraw = duelInfo.winner === 'draw';

    return (
      <div className="w-full max-w-[420px] mx-auto flex flex-col items-center mt-2 px-2 pb-12 space-y-4 text-center animate-fade-in">
        {/* Trophy / Result Icon */}
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-sm ${
          isWinner ? 'bg-gradient-to-tr from-[#FEF3C7] to-[#FDE68A] text-[#D97706]' : 'bg-[#EEF2FF] text-[#5046E5]'
        }`}>
          <Trophy size={34} strokeWidth={2.5} />
        </div>

        <div>
          <div className="text-[12px] font-bold text-[#5046E5] uppercase tracking-wider">
            Head-to-Head Duel Concluded
          </div>
          <h2 className="text-[26px] font-black text-[#1E1B3A] tracking-tight">
            {isWinner
              ? `${duelInfo.winningTeamName} wins!`
              : isDraw
              ? "It's a draw. Good game!"
              : `${duelInfo.winningTeamName} won. Good game!`}
          </h2>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            {duelInfo.winnerReason === 'instant_3_solves' || duelInfo.winnerReason === 'first_to_3'
              ? 'First team to solve all 3 keywords!'
              : duelInfo.winnerReason === 'more_solves'
              ? 'More keywords solved!'
              : duelInfo.winnerReason === 'tie_breaker_time'
              ? 'Tie-breaker: Earlier finish time!'
              : duelInfo.winnerReason === 'tie_breaker_wrong'
              ? 'Tie-breaker: Fewer wrong attempts!'
              : duelInfo.winnerReason === 'forfeit'
              ? 'Opponent forfeited after 60s offline'
              : 'Match Decided'}
          </p>
        </div>

        {/* Prize Banner Card (optional if custom non-chocolate prize set) */}
        {duelInfo.prizeBanner && !duelInfo.prizeBanner.includes('Chocolate') && !duelInfo.prizeBanner.includes('🍫') && (
          <div className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-[20px] p-4 text-center">
            <div className="text-base font-extrabold text-amber-900">
              {duelInfo.prizeBanner}
            </div>
          </div>
        )}

        {/* Head-to-Head Score Summary */}
        <div className="w-full bg-white rounded-[22px] border border-[#E9ECEF] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
          <div className="text-[11px] font-bold tracking-widest text-[#9CA3AF] uppercase text-left">
            Match Recap
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-2xl border text-left ${
              duelInfo.myTeamKey === 'red' ? 'bg-red-50/60 border-red-200' : 'bg-blue-50/60 border-blue-200'
            }`}>
              <span className="text-[11px] font-bold text-gray-500 uppercase block truncate">
                {duelInfo.myTeamName} (You)
              </span>
              <div className="text-2xl font-black font-mono text-[#1E1B3A] mt-1">
                {duelInfo.mySolvedCount} <span className="text-xs text-gray-400">/ 3</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1 font-semibold">
                Finish: {duelInfo.myTeamKey === 'red' ? (duelInfo.teamRedFinishTime ? `${duelInfo.teamRedFinishTime}s` : '-') : (duelInfo.teamBlueFinishTime ? `${duelInfo.teamBlueFinishTime}s` : '-')}
              </div>
            </div>

            <div className={`p-3 rounded-2xl border text-left ${
              duelInfo.myTeamKey === 'red' ? 'bg-blue-50/60 border-blue-200' : 'bg-red-50/60 border-red-200'
            }`}>
              <span className="text-[11px] font-bold text-gray-500 uppercase block truncate">
                {duelInfo.opponentTeamName}
              </span>
              <div className="text-2xl font-black font-mono text-[#1E1B3A] mt-1">
                {duelInfo.opponentSolvedCount} <span className="text-xs text-gray-400">/ 3</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1 font-semibold">
                Finish: {duelInfo.myTeamKey === 'red' ? (duelInfo.teamBlueFinishTime ? `${duelInfo.teamBlueFinishTime}s` : '-') : (duelInfo.teamRedFinishTime ? `${duelInfo.teamRedFinishTime}s` : '-')}
              </div>
            </div>
          </div>

          {/* 3 Keywords Recap With Answers (Safe after duel ends) */}
          {duelInfo.keywordsRecap && duelInfo.keywordsRecap.length > 0 && (
            <div className="pt-3 border-t border-[#F3F4F6] text-left space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                All 3 Duel Keywords Revealed
              </span>
              <div className="space-y-1.5">
                {duelInfo.keywordsRecap.map((kw, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <span className="font-bold text-gray-500 mr-2">Round {i + 1}:</span>
                      <span className="text-gray-400">({kw.category})</span>
                    </div>
                    <span className="font-extrabold text-[#5046E5] uppercase">{kw.answer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {duelInfo.winningPlayers && duelInfo.winningPlayers.length > 0 && (
            <div className="pt-2 border-t border-[#F3F4F6] text-xs text-left text-gray-600">
              <span className="font-bold text-gray-800">Winning Roster: </span>
              {duelInfo.winningPlayers.join(', ')}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="w-full space-y-2.5 pt-2">
          <button
            onClick={() => navigate('/arena')}
            className="w-full py-3.5 px-4 bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold rounded-[14px] flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <BarChart2 size={18} />
            <span>View All Arena Duels</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 px-4 bg-white hover:bg-[#F9FAFB] text-[#4B5563] border border-[#E5E7EB] font-semibold rounded-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. QUICK PLAY SCORE BREAKDOWN (UNTOUCHED PREVIOUS LOGIC)
  if (isFinished) {
    const bd = room.lastRoundScoreBreakdown;
    
    return (
      <div className="w-full max-w-[400px] mx-auto flex flex-col items-center mt-2 px-1">
        {/* Top Status Icon & Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          {room.lastRoundSuccess ? (
            <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center text-[#5046E5] mb-3 shadow-sm">
              <Check size={24} strokeWidth={2.5} />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] mb-3 shadow-sm">
              <X size={24} strokeWidth={2.5} />
            </div>
          )}
          
          <h2 className="text-[22px] font-black text-[#1E1B3A] tracking-tight uppercase">
            {room.lastRoundSuccess ? 'TEAM SUCCESS!' : 'ROUND OVER'}
          </h2>
          <p className="text-[13px] text-[#6B7280] font-normal mt-0.5">
            {room.lastRoundReason || (room.lastRoundSuccess ? 'Correct!' : 'Round Over')}
          </p>
        </div>

        {/* Score Breakdown Card */}
        <div className="w-full bg-white rounded-[22px] border border-[#E9ECEF] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-left">
          <div className="text-[11px] font-bold tracking-widest text-[#9CA3AF] uppercase text-center mb-1">
            THE ANSWER WAS
          </div>
          <div className="text-[24px] font-black text-[#1E1B3A] text-center mb-6 tracking-tight capitalize break-words leading-tight">
            {room.challenge?.answer}
          </div>

          <div className="space-y-2.5 text-[14px]">
            <div className="flex justify-between items-center text-[#6B7280]">
              <span>Base Score</span>
              <span className="font-bold text-[#1E1B3A]">{bd?.baseScore > 0 ? `+${bd.baseScore}` : '0'}</span>
            </div>
            <div className="flex justify-between items-center text-[#6B7280]">
              <span>Time Bonus</span>
              <span className="font-bold text-[#1E1B3A]">{bd?.timeBonus > 0 ? `+${bd.timeBonus}` : '0'}</span>
            </div>
            <div className="flex justify-between items-center text-[#6B7280]">
              <span>Hint Penalty</span>
              <span className="font-bold text-[#1E1B3A]">{bd?.hintPenalty ? bd.hintPenalty : '0'}</span>
            </div>
            <div className="flex justify-between items-center text-[#6B7280]">
              <span>Wrong Penalty</span>
              <span className="font-bold text-[#1E1B3A]">{bd?.wrongPenalty ? bd.wrongPenalty : '0'}</span>
            </div>

            <div className="border-t border-[#F3F4F6] my-2" />

            <div className="flex justify-between items-center text-[#1E1B3A]">
              <span className="font-bold">Multiplier</span>
              <span className="font-bold">x {bd?.multiplier ?? 1}</span>
            </div>
            <div className="flex justify-between items-center text-[#1E1B3A]">
              <span className="font-bold">Round Earned</span>
              <span className="font-bold">{bd?.finalScore > 0 ? `+${bd.finalScore}` : (bd?.finalScore || 0)}</span>
            </div>

            <div className="border-t border-[#F3F4F6] my-2" />

            <div className="flex justify-between items-center pt-1">
              <span className="text-[#1E1B3A] font-extrabold text-[15px]">Total Score</span>
              <span className="text-[#5046E5] font-extrabold text-[22px]">{room.score ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {room.host === myPlayerId ? (
          <div className="flex flex-col gap-2.5 w-full mt-4">
            <button
              onClick={handleSkipWord}
              className="w-full py-3.5 px-4 bg-[#5046E5] hover:bg-[#4338CA] active:scale-[0.99] text-white font-semibold text-[15px] rounded-[14px] flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <span>Play Next Word</span>
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleNextRound}
              className="w-full py-3.5 px-4 bg-white hover:bg-[#F9FAFB] active:scale-[0.99] text-[#5046E5] border border-[#E5E7EB] font-semibold text-[15px] rounded-[14px] flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <span>Back to Lobby</span>
            </button>
          </div>
        ) : (
          <div className="text-center text-[#9CA3AF] text-[13px] font-medium mt-4">
            Waiting for host...
          </div>
        )}

        {/* All Clues Revealed */}
        {room.allClues && room.allClues.length > 0 && (
          <div className="w-full mt-6">
            <h3 className="text-[16px] font-bold text-[#1E1B3A] mb-3 text-left">
              All Clues Revealed
            </h3>
            <div className="flex flex-col gap-2.5 w-full pb-8">
              {room.allClues.map((c, i) => (
                <div
                  key={i}
                  className="bg-white rounded-[16px] border border-[#E9ECEF] p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1.5"
                >
                  <div className="text-[12px] font-bold text-[#1E1B3A] flex items-center gap-2">
                    <Lightbulb size={14} className="text-[#5046E5]" />
                    <span>{c.name}'s Clue</span>
                  </div>
                  <div className="text-[13px] text-[#4B5563] leading-relaxed">
                    {c.clue}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. ACTIVE PLAYING ROUND
  const badgeHex = room.categoryMeta?.color || '#6C4CF1';

  return (
    <div className={`flex flex-col h-full w-full max-w-[440px] mx-auto transition-colors duration-500 z-10 relative ${isUrgent ? 'bg-danger-bg rounded-[24px] p-4' : ''}`}>
      {/* Header Info */}
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex flex-col items-start">
          <span className="text-xs text-text-muted font-bold uppercase tracking-widest mb-1">
            {isDuel ? `Round ${duelInfo?.currentRound || 1} of 3` : isEvent ? `Round ${room.currentRound || 1} of 3` : 'Category'}
          </span>
          <span 
            className="px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] shadow-sm border border-black/5"
            style={{ backgroundColor: `${badgeHex}20`, color: badgeHex }}
          >
            {room.categoryMeta?.emoji || (isDuel ? '⚔️' : '')} {room.category || (isDuel ? 'Duel' : '')}
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
          <span className="text-xs text-text-muted font-bold uppercase tracking-widest mb-1">
            {isDuel ? (duelInfo?.opponentTeamName || 'Opponent') : isEvent ? (room.teamName || 'Team') : 'Score'}
          </span>
          <span className="text-2xl font-black font-mono text-text">
            {isDuel ? `${opponentSolvedCount}/3` : isEvent ? `R${room.currentRound || 1}` : (room.score ?? 0)}
          </span>
        </div>
      </div>

      {/* Duel Mode Race Progress for Both Teams */}
      {isDuel && (
        <div className="mb-4 bg-white border border-[#E5E7EB] rounded-2xl p-3 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 pb-1 border-b border-gray-100">
            <span>Round {duelInfo?.currentRound || 1} of 3</span>
            <span className="font-mono text-indigo-600">Match Elapsed: {matchElapsed}s</span>
          </div>

          {/* Your Team Progress */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-gray-800">{duelInfo?.myTeamName || 'Your Team'} (You)</span>
              <span className="text-emerald-600 font-mono font-black">{duelInfo?.mySolvedCount || 0}/3</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${((duelInfo?.mySolvedCount || 0) / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Opponent Progress (Solved Count Only - Never Clues/Guesses/Typing) */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-gray-500">{duelInfo?.opponentTeamName || 'Opponent'}</span>
              <span className="text-indigo-600 font-mono font-black">{opponentSolvedCount}/3</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${(opponentSolvedCount / 3) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col justify-between space-y-4">
        {/* Progressive Release Header / Wave Indicator */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#5046E5] text-xs font-bold border border-[#E0E7FF]">
              Wave {room.currentWave || 1} of {room.totalWaves || 1}
            </span>
            {newClueArrived && (
              <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#10B981] text-[11px] font-bold border border-[#A7F3D0] animate-pulse">
                New Clue!
              </span>
            )}
          </div>
          {room.hasMoreClues && nextClueCountdown > 0 ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7280]">
              <Clock size={13} className="text-[#5046E5]" />
              <span>
                Next clue in 0:{nextClueCountdown < 10 ? `0${nextClueCountdown}` : nextClueCountdown}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-medium text-[#9CA3AF]">
              All clues released
            </span>
          )}
        </div>

        {/* Numbered Clue Cards */}
        <div className="space-y-3">
          {cluesList.length > 0 ? (
            cluesList.map((c, idx) => {
              const isLatest = idx === cluesList.length - 1 && newClueArrived;
              return (
                <div
                  key={idx}
                  className={`p-5 rounded-[20px] border-2 transition-all duration-500 shadow-sm text-left relative overflow-hidden ${
                    isLatest
                      ? 'bg-[#EEF2FF] border-[#5046E5] ring-2 ring-[#5046E5]/20 shadow-md'
                      : 'bg-white border-[#E9ECEF]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold text-[#5046E5] uppercase tracking-wider bg-[#F3F4F6] px-2 py-0.5 rounded-md">
                      Clue #{c.index || (idx + 1)}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest">
                      Keep Secret · Talk
                    </span>
                  </div>
                  <p className="text-lg sm:text-xl font-medium text-[#1E1B3A] leading-relaxed">
                    "{c.text}"
                  </p>
                </div>
              );
            })
          ) : (
            <div className="bg-white border-2 border-dashed border-[#CBD5E1] p-6 rounded-[20px] text-center text-[#9CA3AF]">
              Waiting for clue release...
            </div>
          )}
        </div>

        {/* Shared Hint Area if used */}
        {room.sharedHint && (
          <div className="bg-hint-bg border border-hint/20 p-4 rounded-[18px] text-center">
            <span className="text-xs font-bold text-hint uppercase tracking-wider block mb-1">Shared Clue</span>
            <p className="text-text font-medium text-sm">"{room.sharedHint}"</p>
          </div>
        )}

        {/* Status / Guesses remaining */}
        <div className="flex justify-between items-center text-xs text-text-muted px-2 font-medium">
          <span>Wrong attempts: {room.wrongAttempts || 0} / {room.roundRules?.maxAttempts || 3}</span>
          <span>Hints used: {room.hintsUsed || 0} / {room.roundRules?.maxHints || 2}</span>
        </div>

        {/* Error / Alert Message */}
        {errorMsg && (
          <div className="bg-danger-bg text-danger border border-danger/20 p-3 rounded-[14px] text-sm font-bold text-center flex items-center justify-center space-x-2">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Controls: Input & Hint */}
        <div className="space-y-3">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <input
              type="text"
              placeholder="Team answer..."
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              className="flex-grow bg-surface border-2 border-border rounded-[18px] px-5 py-4 text-lg font-bold text-text placeholder-text-muted focus:outline-none focus:border-primary shadow-sm"
            />
            <Button type="submit" variant="success" className="px-6 rounded-[18px]">
              <Send size={20} />
            </Button>
          </form>

          <div className="flex space-x-2">
            <Button
              type="button"
              onClick={handleHint}
              variant="secondary"
              className="flex-grow py-3 rounded-[16px] text-sm flex items-center justify-center space-x-2 border-border"
              disabled={
                (room.roundRules?.waveIntervalSeconds || room.waveIntervalSeconds || 0) > 0 ||
                room.hintsUsed >= (room.roundRules?.maxHints || 0)
              }
            >
              <Lightbulb size={16} className="text-hint" />
              <span>
                {(room.roundRules?.waveIntervalSeconds || room.waveIntervalSeconds || 0) > 0
                  ? 'Hints Disabled (Progressive Clues Active)'
                  : `Use Hint (${Math.max(0, (room.roundRules?.maxHints || 0) - (room.hintsUsed || 0))} left)`
                }
              </span>
            </Button>

            {!isEvent && room.host === myPlayerId && (
              <Button
                type="button"
                onClick={handleSkipWord}
                variant="ghost"
                className="py-3 px-4 rounded-[16px] text-sm border border-border text-text-muted hover:text-text"
              >
                Skip Word
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
