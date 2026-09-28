import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSocket } from '../contexts/SocketContext';

export default function Lobby({ user, onMatchStart, onNavigate }) {
  const { socket, onlineCount } = useSocket();
  const [mode, setMode] = useState('idle');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleRoomCreated = ({ roomCode }) => {
      setRoomCode(roomCode);
      setMode('waiting');
    };

    const handleMatchReady = ({ roomCode, opponent }) => {
      onMatchStart({ roomCode, opponent });
    };

    const handleError = ({ message }) => {
      setError(message);
      setMode('idle');
    };

    const handleOpponentLeft = () => {
      setMode('idle');
      setError('Opponent disconnected');
    };

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
    if (!socket || !joinCode) return;
    setError(null);
    const normalized = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized || normalized.length < 4) {
      setError('Please enter a valid room code');
      return;
    }
    socket.emit('join-room', { roomCode: normalized });
  };

  const handleCancel = () => {
    if (!socket) return;
    if (mode === 'searching') {
      socket.emit('cancel-find');
    } else if (mode === 'waiting') {
      socket.emit('leave-room');
    }
    setMode('idle');
  };

  return (
    <div className="lobby">
      <div className="lobby__header">
        <h1 className="lobby__title">Game Lobby</h1>
        <div className="lobby__online">
          <span className="lobby__online-dot"></span>
          {onlineCount} Players Online
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn btn--ghost" onClick={() => onNavigate('leaderboard')}>Leaderboard</button>
          <button className="btn btn--ghost" onClick={() => onNavigate('matches')}>Match History</button>
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          style={{ color: '#ef4444', marginBottom: '1rem', textAlign: 'center' }}
        >
          {error}
        </motion.div>
      )}

      <div className="lobby__actions">
        {/* Card 1: Quick Match */}
        <motion.div 
          className="lobby__action-card"
          whileHover={{ y: -4 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <div className="lobby__action-icon">⚔️</div>
          <h3 className="lobby__action-title">Quick Match</h3>
          <p className="lobby__action-desc">Find a random opponent</p>
          
          {mode === 'searching' ? (
            <div className="lobby__searching">
              <div>Searching for opponent...</div>
              <button className="btn btn--secondary" onClick={handleCancel}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn--primary" onClick={handleFindMatch} disabled={mode !== 'idle'}>
              FIND MATCH
            </button>
          )}
        </motion.div>

        {/* Card 2: Private Room */}
        <motion.div 
          className="lobby__action-card"
          whileHover={{ y: -4 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="lobby__action-icon">🏰</div>
          <h3 className="lobby__action-title">Private Room</h3>
          <p className="lobby__action-desc">Create a room and share the code</p>
          
          {mode === 'creating' ? (
            <div>Creating...</div>
          ) : mode === 'waiting' ? (
            <div className="lobby__waiting">
              <div>Share this code:</div>
              <div className="lobby__room-code">{roomCode}</div>
              <div>Waiting for opponent...</div>
              <button className="btn btn--secondary" onClick={handleCancel} style={{ marginTop: '0.5rem' }}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn--secondary" onClick={handleCreateRoom} disabled={mode !== 'idle'}>
              CREATE ROOM
            </button>
          )}
        </motion.div>

        {/* Card 3: Join Room */}
        <motion.div 
          className="lobby__action-card"
          whileHover={{ y: -4 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="lobby__action-icon">🚪</div>
          <h3 className="lobby__action-title">Join Room</h3>
          <p className="lobby__action-desc">Enter a room code to join</p>
          
          <div className="lobby__room-input" style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
            <input 
              type="text" 
              value={joinCode} 
              onChange={(e) => setJoinCode(e.target.value)} 
              placeholder="ROOM CODE" 
              maxLength={6}
              disabled={mode !== 'idle'}
              style={{ padding: '0.5rem', textAlign: 'center', fontSize: '1.2rem', textTransform: 'uppercase' }}
            />
            <button className="btn btn--primary" onClick={handleJoinRoom} disabled={mode !== 'idle' || !joinCode}>
              JOIN
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
