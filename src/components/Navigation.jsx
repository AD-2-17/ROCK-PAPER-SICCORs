import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export default function Navigation({ currentPage, onNavigate }) {
  const { user, logout } = useAuth();
  const { connected, onlineCount } = useSocket();

  return (
    <motion.nav 
      className="nav"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, type: 'spring', stiffness: 120 }}
    >
      <div 
        className="nav__logo" 
        onClick={() => onNavigate(user ? 'lobby' : 'landing')}
      >
        DOG OF WAR
      </div>

      <div className="nav__links">
        {!user ? (
          <>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'landing' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('landing')}>Home</motion.button>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'leaderboard' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('leaderboard')}>Leaderboard</motion.button>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'about' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('about')}>About</motion.button>
          </>
        ) : (
          <>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'lobby' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('lobby')}>Lobby</motion.button>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'matches' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('matches')}>Matches</motion.button>
            <motion.button whileHover={{ scale: 1.05 }} className={`nav__link ${currentPage === 'leaderboard' ? 'nav__link--active' : ''}`} onClick={() => onNavigate('leaderboard')}>Leaderboard</motion.button>
          </>
        )}
      </div>

      <div className="nav__auth">
        {!user ? (
          <motion.button 
            whileHover={{ scale: 1.05 }} 
            className="btn btn--primary" 
            onClick={() => onNavigate('login')}
          >
            LOGIN
          </motion.button>
        ) : (
          <>
            <div className="nav__online">
              <div className="nav__online-dot" style={{ backgroundColor: connected ? 'var(--accent-green)' : 'var(--text-muted)' }}></div>
              {onlineCount} Online
            </div>
            <div className="nav__username">{user.username}</div>
            <motion.button 
              whileHover={{ scale: 1.05 }} 
              className="btn btn--secondary" 
              onClick={() => {
                logout();
                onNavigate('landing');
              }}
            >
              LOGOUT
            </motion.button>
          </>
        )}
      </div>
    </motion.nav>
  );
}
