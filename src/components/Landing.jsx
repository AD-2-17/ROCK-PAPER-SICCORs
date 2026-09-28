import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

export default function Landing({ onNavigate }) {
  const { user } = useAuth();

  const handlePrimaryClick = () => {
    if (user) onNavigate('lobby');
    else onNavigate('login');
  };

  return (
    <div className="landing">
      <div className="landing__hero">
        <div className="landing__hands">
          <motion.div 
            className="landing__hand"
            animate={{ y: [0, -15, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            ✊
          </motion.div>
          <motion.div 
            className="landing__hand"
            animate={{ x: [-10, 10, -10], rotate: [-5, 5, -5] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          >
            ✋
          </motion.div>
          <motion.div 
            className="landing__hand"
            animate={{ rotate: [-10, 10, -10] }}
            transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
          >
            ✌️
          </motion.div>
        </div>

        <motion.h1 
          className="landing__title"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          DOG OF WAR
        </motion.h1>

        <motion.p 
          className="landing__tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          The Ultimate Rock Paper Scissors Arena
        </motion.p>

        <motion.div 
          className="landing__ctas"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <button className="btn btn--primary btn--xl" onClick={handlePrimaryClick}>
            FIND MATCH
          </button>
          <button className="btn btn--secondary btn--xl" onClick={handlePrimaryClick}>
            PRIVATE ROOM
          </button>
        </motion.div>
      </div>
    </div>
  );
}
