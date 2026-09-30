import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export default function Navigation({ currentPage, onNavigate }) {
  const { user, logout } = useAuth();
  const { connected, onlineCount } = useSocket();
  const navigation = user
    ? [['Home', 'lobby'], ['Recent matches', 'matches'], ['Leaderboard', 'leaderboard']]
    : [['Home', 'landing'], ['Leaderboard', 'leaderboard']];

  return (
    <motion.nav className="nav" initial={{ y: -36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
      <button className="nav__brand" onClick={() => onNavigate(user ? 'lobby' : 'landing')} aria-label="Go home">
        <span className="nav__mark">D</span>
        <span>DOG <strong>OF</strong> WAR</span>
      </button>

      <div className="nav__links" aria-label="Main navigation">
        {navigation.map(([label, page]) => (
          <button key={page} className={`nav__link ${currentPage === page ? 'nav__link--active' : ''}`} onClick={() => onNavigate(page)}>
            {label}
          </button>
        ))}
      </div>

      <div className="nav__auth">
        {!user ? (
          <button className="btn btn--primary nav__login" onClick={() => onNavigate('login')}>Log in</button>
        ) : (
          <>
            <span className="nav__online"><i className={`nav__online-dot ${connected ? '' : 'nav__online-dot--offline'}`} />{onlineCount} online</span>
            <button className="nav__wallet" type="button" aria-label="Dog balance">1,250 <strong>$DOG</strong></button>
            <span className="nav__user">{user.username}</span>
            <button className="nav__logout" onClick={() => { logout(); onNavigate('landing'); }}>Log out</button>
          </>
        )}
      </div>
    </motion.nav>
  );
}
