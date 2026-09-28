import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Navigation from './components/Navigation';
import ParticleBackground from './components/ParticleBackground';
import Landing from './components/Landing';
import Login from './components/Login';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Leaderboard from './components/Leaderboard';
import RecentMatches from './components/RecentMatches';

function AppContent() {
  const [currentPage, setCurrentPage] = useState('landing');
  const [gameData, setGameData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user && currentPage === 'landing') {
      setCurrentPage('lobby');
    } else if (!user && ['lobby', 'game', 'matches'].includes(currentPage)) {
      setCurrentPage('landing');
    }
  }, [user, currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <Landing onNavigate={setCurrentPage} />;
      case 'login':
        return <Login onLoginSuccess={() => setCurrentPage('lobby')} />;
      case 'lobby':
        return (
          <Lobby 
            user={user} 
            onMatchStart={({ roomCode, opponent }) => { 
              setGameData({ roomCode, opponent }); 
              setCurrentPage('game'); 
            }} 
            onNavigate={setCurrentPage} 
          />
        );
      case 'game':
        return (
          <GameRoom 
            roomCode={gameData?.roomCode} 
            opponent={gameData?.opponent} 
            user={user} 
            onLeave={() => { 
              setGameData(null); 
              setCurrentPage('lobby'); 
            }} 
          />
        );
      case 'leaderboard':
        return <Leaderboard onBack={() => setCurrentPage(user ? 'lobby' : 'landing')} />;
      case 'matches':
        return <RecentMatches onBack={() => setCurrentPage('lobby')} />;
      default:
        return <Landing onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="app">
      <ParticleBackground />
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}
