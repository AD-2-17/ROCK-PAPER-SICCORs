import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';

const rules = [
  ['Rock', 'beats scissors', 'rock'],
  ['Paper', 'beats rock', 'paper'],
  ['Scissors', 'beats paper', 'scissors'],
];

const liveWins = [
  ['DogeMaster', '+1,250 $DOG', '12s ago'],
  ['CryptoPaws', '+320 $DOG', '38s ago'],
  ['ShibaSage', '+890 $DOG', '1m ago'],
];

export default function Lobby({ onMatchStart }) {
  const { socket, onlineCount } = useSocket();
  const [mode, setMode] = useState('idle');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return undefined;
    const handleRoomCreated = ({ roomCode: createdCode }) => { setRoomCode(createdCode); setMode('waiting'); };
    const handleMatchReady = ({ roomCode: matchedCode, opponent }) => onMatchStart({ roomCode: matchedCode, opponent });
    const handleError = ({ message }) => { setError(message); setMode('idle'); };
    const handleOpponentLeft = () => { setMode('idle'); setError('Opponent disconnected'); };

    socket.on('room-created', handleRoomCreated);
    socket.on('match-ready', handleMatchReady);
    socket.on('error', handleError);
    socket.on('opponent-left', handleOpponentLeft);
    return () => {
      socket.off('room-created', handleRoomCreated);
      socket.off('match-ready', handleMatchReady);
      socket.off('error', handleError);
      socket.off('opponent-left', handleOpponentLeft);
    };
  }, [socket, onMatchStart]);

  const handleFindMatch = () => {
    if (!socket) return;
    setError(null);
    if (mode === 'searching') {
      socket.emit('cancel-find');
      setMode('idle');
      return;
    }
    socket.emit('find-match');
    setMode('searching');
  };

  const handleCreateRoom = () => {
    if (!socket) return;
    setError(null);
    socket.emit('create-room');
    setMode('creating');
  };

  const handleJoinRoom = () => {
    if (!socket) return;
    const normalized = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length < 4) {
      setError('Enter a valid room code.');
      return;
    }
    setError(null);
    socket.emit('join-room', { roomCode: normalized });
  };

  const handleCancel = () => {
    if (!socket) return;
    socket.emit(mode === 'searching' ? 'cancel-find' : 'leave-room');
    setMode('idle');
  };

  return (
    <main className="lobby">
      <div className="lobby__scene" aria-hidden="true">
        <img className="lobby__hand lobby__hand--rock" src="/assets/hands/rock.png" alt="" />
        <img className="lobby__hand lobby__hand--scissors" src="/assets/hands/scissors.png" alt="" />
        <img className="lobby__hand lobby__hand--paper" src="/assets/hands/paper.png" alt="" />
        <span className="lobby__scene-word lobby__scene-word--rock">Rock</span>
        <span className="lobby__scene-word lobby__scene-word--scissors">Scissors</span>
        <span className="lobby__scene-word lobby__scene-word--paper">Paper</span>
      </div>

      <section className="lobby__content">
        <header className="lobby__header">
          <div className="lobby__crest" aria-hidden="true">D</div>
          <p className="lobby__kicker"><i /> {onlineCount} players in the arena</p>
          <h1 className="lobby__title">DOG <span>OF</span> WAR</h1>
          <p className="lobby__subtitle">Choose a hand. Find an opponent. Take the round.</p>
        </header>

        <AnimatePresence>
          {error && <motion.p className="lobby__error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>}
        </AnimatePresence>

        <div className="lobby__actions">
          <motion.button className={`lobby__action lobby__action--match ${mode !== 'idle' && mode !== 'searching' ? 'is-muted' : ''}`} type="button" onClick={handleFindMatch} whileTap={{ y: 3 }}>
            <span className="lobby__action-icon">X</span>
            <span><strong>{mode === 'searching' ? 'Searching...' : 'Find match'}</strong><small>{mode === 'searching' ? 'Tap to cancel' : 'Play a random opponent'}</small></span>
          </motion.button>
          <motion.button className="lobby__action lobby__action--room" type="button" onClick={() => setMode(mode === 'private' ? 'idle' : 'private')} whileTap={{ y: 3 }}>
            <span className="lobby__action-icon">+</span>
            <span><strong>Private room</strong><small>Create or enter a code</small></span>
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'private' && (
            <motion.section className="lobby__private" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="lobby__private-option">
                <p className="lobby__section-label">Host a round</p>
                <h2>Make a private room</h2>
                <p>Share the generated code with one opponent.</p>
                <button className="btn btn--primary" onClick={handleCreateRoom}>Create room</button>
              </div>
              <div className="lobby__private-option">
                <p className="lobby__section-label">Join a round</p>
                <h2>Enter a room code</h2>
                <div className="lobby__join">
                  <input aria-label="Room code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="CODE" maxLength={6} />
                  <button className="btn btn--secondary" onClick={handleJoinRoom} disabled={!joinCode}>Join</button>
                </div>
              </div>
            </motion.section>
          )}

          {(mode === 'creating' || mode === 'waiting') && (
            <motion.section className="lobby__waiting" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              {mode === 'creating' ? <><span className="spinner" /> Creating your room...</> : <><p className="lobby__section-label">Room code</p><strong className="lobby__room-code">{roomCode}</strong><p>Waiting for an opponent to join.</p><button className="btn btn--danger" onClick={handleCancel}>Cancel room</button></>}
            </motion.section>
          )}

          {mode === 'idle' && (
            <motion.div className="lobby__details" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <section className="lobby__panel">
                <div className="lobby__panel-heading"><div><p className="lobby__section-label">Know the game</p><h2>Round rules</h2></div><span>First to react wins</span></div>
                <div className="lobby__rules">
                  {rules.map(([name, description, choice]) => <div className={`lobby__rule lobby__rule--${choice}`} key={choice}><img src={`/assets/hands/${choice}.png`} alt="" /><span><strong>{name}</strong><small>{description}</small></span></div>)}
                </div>
              </section>
              <section className="lobby__panel lobby__wins">
                <div className="lobby__panel-heading"><div><p className="lobby__section-label">Just now</p><h2>Live wins</h2></div><span>Real players. Real rounds.</span></div>
                <div className="lobby__win-list">
                  {liveWins.map(([name, amount, time]) => <div className="lobby__win" key={name}><span className="lobby__avatar">D</span><strong>{name}</strong><b>{amount}</b><small>{time}</small></div>)}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
