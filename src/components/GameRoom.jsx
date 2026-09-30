import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';
import { GameHand, HandPreview } from './Hand2D';

const CHOICES = [
  { id: 'rock', label: 'Rock' },
  { id: 'paper', label: 'Paper' },
  { id: 'scissors', label: 'Scissors' },
];

const COUNTDOWN_WORDS = ['ROCK', 'ROCK', 'ROCK', 'SHOOT!'];
const BEAT_DURATION = 600; // ms per beat

export default function GameRoom({ roomCode, opponent, user, onLeave }) {
  const { socket } = useSocket();
  
  // Game state
  const [phase, setPhase] = useState('choosing'); // choosing, waiting, countdown, reveal, result
  const [playerChoice, setPlayerChoice] = useState(null);
  const [opponentChoice, setOpponentChoice] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [scores, setScores] = useState({ player: 0, opponent: 0 });
  const [opponentReady, setOpponentReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  
  // Animation state
  const [countdownWord, setCountdownWord] = useState('');
  const [countdownIndex, setCountdownIndex] = useState(-1);
  const [handAnimState, setHandAnimState] = useState('idle');
  const [displayChoice, setDisplayChoice] = useState('rock');
  const [opponentDisplayChoice, setOpponentDisplayChoice] = useState('rock');
  const [resultGlow, setResultGlow] = useState(null);
  const [handTransitionKey, setHandTransitionKey] = useState(0);
  const [hoveredChoice, setHoveredChoice] = useState(null);
  
  // Pending result from server (stored while countdown plays)
  const pendingResultRef = useRef(null);
  const timeoutRefs = useRef([]);
  
  const opponentName = typeof opponent === 'string' ? opponent : opponent?.username || 'Opponent';

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleOpponentChose = () => {
      // Opponent has made their choice - we could show an indicator here
    };

    const handleRoundResult = (data) => {
      const { playerChoice: pChoice, opponentChoice: oChoice, result, scores: newScores } = data;
      
      // Store the pending result
      pendingResultRef.current = { pChoice, oChoice, result, newScores };
      
      // Start the countdown animation sequence
      startCountdown();
    };

    const handleOpponentPlayAgain = () => setOpponentReady(true);

    const handleNewRound = () => {
      // Reset everything for new round
      setPhase('choosing');
      setPlayerChoice(null);
      setOpponentChoice(null);
      setRoundResult(null);
      setPlayerReady(false);
      setOpponentReady(false);
      setHandAnimState('idle');
      setDisplayChoice('rock');
      setOpponentDisplayChoice('rock');
      setResultGlow(null);
      setCountdownWord('');
      setCountdownIndex(-1);
      setHandTransitionKey(k => k + 1);
      pendingResultRef.current = null;
    };

    const handleOpponentLeft = () => onLeave();

    socket.on('opponent-chose', handleOpponentChose);
    socket.on('round-result', handleRoundResult);
    socket.on('opponent-play-again', handleOpponentPlayAgain);
    socket.on('new-round', handleNewRound);
    socket.on('opponent-left', handleOpponentLeft);

    return () => {
      socket.off('opponent-chose', handleOpponentChose);
      socket.off('round-result', handleRoundResult);
      socket.off('opponent-play-again', handleOpponentPlayAgain);
      socket.off('new-round', handleNewRound);
      socket.off('opponent-left', handleOpponentLeft);

      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, [socket, onLeave]);

  const startCountdown = useCallback(() => {
    setPhase('countdown');
    setHandAnimState('bounce');
    setDisplayChoice('rock');
    setOpponentDisplayChoice('rock');
    
    // ROCK - PAPER - SCISSORS - SHOOT!
    COUNTDOWN_WORDS.forEach((word, i) => {
      const t = setTimeout(() => {
        setCountdownWord(word);
        setCountdownIndex(i);
        
        if (i < 3) {
          // Bounce on each beat
          setHandAnimState('bounce');
        }
        
        if (word === 'SHOOT!') {
          // On SHOOT - do the reveal
          setHandAnimState('anticipation');
          
          const revealTimeout = setTimeout(() => {
            const pending = pendingResultRef.current;
            if (!pending) return;
            
            const { pChoice, oChoice, result, newScores } = pending;
            
            // Swap to final models
            setDisplayChoice(pChoice);
            setOpponentDisplayChoice(oChoice);
            setHandTransitionKey(k => k + 1);
            setHandAnimState('reveal');
            setPlayerChoice(pChoice);
            setOpponentChoice(oChoice);
            
            // After reveal animation settles, show result
            const resultTimeout = setTimeout(() => {
              setPhase('result');
              setRoundResult(result);
              setScores({ player: newScores.player, opponent: newScores.opponent });
              setResultGlow(result);
              
              // Set final hand animation state
              setHandAnimState(result === 'win' ? 'win' : result === 'loss' ? 'loss' : 'draw');
            }, 800);
            
            timeoutRefs.current.push(resultTimeout);
          }, 300);
          
          timeoutRefs.current.push(revealTimeout);
        }
      }, i * BEAT_DURATION);
      
      timeoutRefs.current.push(t);
    });
  }, []);

  const handleChoice = (choiceId) => {
    if (phase !== 'choosing' || !socket) return;
    setPlayerChoice(choiceId);
    setPhase('waiting');
    socket.emit('player-choice', { choice: choiceId });
  };

  const handlePlayAgain = () => {
    if (!socket) return;
    setPlayerReady(true);
    socket.emit('play-again');
  };

  const handleLeave = () => {
    if (socket) socket.emit('leave-room');
    onLeave();
  };

  const isCountdownOrLater = phase === 'countdown' || phase === 'reveal' || phase === 'result';

  return (
    <div className="game">
      {/* 3D Hand Display */}
      <div className="game__hands-container">
        <div className="game__hand-wrapper game__hand-wrapper--player">
          <GameHand
            choice={displayChoice}
            isOpponent={false}
            animState={handAnimState}
            bouncePhase={countdownIndex}
            resultGlow={resultGlow === 'win' ? 'win' : resultGlow === 'loss' ? 'loss' : resultGlow === 'draw' ? 'draw' : null}
            transitionKey={`player-${handTransitionKey}`}
          />
        </div>
        
        <div className="game__hand-wrapper game__hand-wrapper--opponent">
          <GameHand
            choice={opponentDisplayChoice}
            isOpponent={true}
            animState={handAnimState}
            bouncePhase={countdownIndex}
            resultGlow={resultGlow === 'win' ? 'loss' : resultGlow === 'loss' ? 'win' : resultGlow === 'draw' ? 'draw' : null}
            transitionKey={`opponent-${handTransitionKey}`}
          />
        </div>
      </div>

      {/* Countdown Word Display */}
      <AnimatePresence mode="wait">
        {phase === 'countdown' && countdownWord && (
          <motion.div
            key={countdownWord}
            className="game__countdown-word"
            initial={{ scale: 2, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            {countdownWord}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Info Bar */}
      <div className="game__players" style={{ zIndex: 20 }}>
        <div className="game__player">
          <div className="game__player-avatar">
            {user?.username?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="game__player-name">{user?.username || 'You'}</div>
          <div className="game__player-score">{scores.player}</div>
        </div>
        <div className="game__vs">VS</div>
        <div className="game__player">
          <div className="game__player-avatar">
            {opponentName.charAt(0).toUpperCase()}
          </div>
          <div className="game__player-name">{opponentName}</div>
          <div className="game__player-score">{scores.opponent}</div>
        </div>
      </div>

      {/* Game Arena */}
      <div className="game__arena" style={{ zIndex: 20, flex: 1, justifyContent: 'flex-end', paddingBottom: '40px' }}>
        
        {/* CHOOSING / WAITING PHASE — Choice Cards */}
        {(phase === 'choosing' || phase === 'waiting') && (
          <motion.div 
            className="game__choices"
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {CHOICES.map(c => {
              const isSelected = playerChoice === c.id;
              const isDimmed = playerChoice && !isSelected;
              const isHovered = hoveredChoice === c.id;
              return (
                <button
                  key={c.id}
                  className={`game__choice game__choice-card ${isSelected ? 'game__choice--selected' : ''} ${isDimmed ? 'game__choice--dimmed' : ''}`}
                  onClick={() => handleChoice(c.id)}
                  disabled={phase !== 'choosing'}
                  onMouseEnter={() => setHoveredChoice(c.id)}
                  onMouseLeave={() => setHoveredChoice(null)}
                >
                  <div className="game__choice-preview">
                    <HandPreview 
                      choice={c.id} 
                      isHovered={isHovered && !isSelected}
                      isSelected={isSelected}
                    />
                  </div>
                  <span className="game__choice-label">{c.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
        
        {phase === 'waiting' && (
          <motion.div
            className="game__waiting-text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ marginTop: '20px' }}
          >
            Waiting for opponent...
          </motion.div>
        )}

        {/* Countdown phase — choices hidden */}
        {phase === 'countdown' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="game__countdown-phase"
          >
            <div className="game__waiting-text" style={{ fontSize: '0.875rem', opacity: 0.7 }}>
              Revealing moves...
            </div>
          </motion.div>
        )}

        {/* RESULT PHASE */}
        {phase === 'result' && (
          <motion.div
            className="game__result"
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <div className={`game__result-text game__result-text--${roundResult}`}>
              {roundResult === 'win' ? 'YOU WIN!' : roundResult === 'loss' ? 'YOU LOSE' : 'DRAW!'}
            </div>

            <div className="game__result-choices">
              <span className="game__result-choice-label">
                {CHOICES.find(c => c.id === playerChoice)?.label || '?'}
              </span>
              <span className="game__result-vs">vs</span>
              <span className="game__result-choice-label">
                {CHOICES.find(c => c.id === opponentChoice)?.label || '?'}
              </span>
            </div>

            <div className="game__actions">
              {!playerReady ? (
                <>
                  <button className="btn btn--primary btn--lg" onClick={handlePlayAgain}>PLAY AGAIN</button>
                  <button className="btn btn--danger" onClick={handleLeave}>EXIT</button>
                </>
              ) : (
                <div className="game__waiting-text">Waiting for opponent to play again...</div>
              )}
            </div>
            {opponentReady && !playerReady && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ color: 'var(--accent-orange)', marginTop: '16px', fontWeight: 600, textAlign: 'center' }}
              >
                Opponent wants to rematch!
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
