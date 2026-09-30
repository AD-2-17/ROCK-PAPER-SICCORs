import React from 'react';
import { motion } from 'framer-motion';

const HAND_ASSETS = {
  rock: '/assets/hands/rock.png',
  paper: '/assets/hands/paper.png',
  scissors: '/assets/hands/scissors.png',
};

// Choice preview cards inside the selection bar
export function HandPreview({ choice, isHovered = false, isSelected = false }) {
  const scale = isSelected ? 1.15 : isHovered ? 1.08 : 1.0;
  
  return (
    <motion.div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      animate={{ scale }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <img
        src={HAND_ASSETS[choice]}
        alt={choice}
        style={{
          maxWidth: '85%',
          maxHeight: '85%',
          objectFit: 'contain',
          transform: (choice === 'paper' || choice === 'scissors') ? 'scaleX(-1)' : 'none',
          filter: isSelected ? 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.9))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
        }}
      />
    </motion.div>
  );
}

// Main gameplay hands
export function GameHand({ 
  choice = 'rock', 
  isOpponent = false,
  animState = 'idle', // idle, bounce, anticipation, reveal, win, loss, draw
  bouncePhase = 0,
}) {
  const isRevealed = animState === 'reveal' || animState === 'win' || animState === 'loss' || animState === 'draw';
  
  // During prep / bounce phase, both players hold 'rock'
  const displayChoice = isRevealed ? choice : 'rock';
  const assetSrc = HAND_ASSETS[displayChoice] || HAND_ASSETS.rock;

  // Rock natively faces Right. Paper & Scissors natively face Left.
  const nativeFacesLeft = displayChoice === 'paper' || displayChoice === 'scissors';

  // Player wants to face Right. Opponent wants to face Left.
  let flipScale = 1;
  if (isOpponent) {
    flipScale = nativeFacesLeft ? 1 : -1;
  } else {
    flipScale = nativeFacesLeft ? -1 : 1;
  }

  let animateProps = {
    x: 0,
    y: 0,
    rotate: 0,
    scaleX: flipScale,
    scaleY: 1,
    opacity: 1,
  };

  let transitionProps = {
    type: 'spring',
    stiffness: 300,
    damping: 22
  };

  if (animState === 'idle') {
    // Floating motion
    animateProps.y = [0, -12, 0];
    transitionProps = { duration: 3, repeat: Infinity, ease: 'easeInOut' };
  } else if (animState === 'bounce') {
    // Synchronized rhythmic pumping motion (up and down along the arm axis)
    // Beat changes every 600ms
    animateProps.y = [0, -60, 10, 0];
    animateProps.x = [0, isOpponent ? -15 : 15, isOpponent ? 5 : -5, 0];
    animateProps.rotate = [0, isOpponent ? 6 : -6, isOpponent ? -3 : 3, 0];
    transitionProps = { duration: 0.52, times: [0, 0.35, 0.75, 1], ease: 'easeOut' };
  } else if (animState === 'anticipation') {
    // Pull back before reveal
    animateProps.y = -40;
    animateProps.x = isOpponent ? 30 : -30;
    animateProps.scaleY = 0.92;
    transitionProps = { type: 'spring', stiffness: 450, damping: 25 };
  } else if (animState === 'reveal') {
    // Slam forward into place for move reveal
    animateProps.y = -10;
    animateProps.x = isOpponent ? -30 : 30;
    animateProps.scaleY = 1.12;
    transitionProps = { type: 'spring', stiffness: 350, damping: 14 };
  } else if (animState === 'win') {
    // Winner celebratory pulse
    animateProps.y = [-10, -25, -10];
    animateProps.scaleY = 1.22;
    transitionProps = { duration: 1.5, repeat: Infinity, ease: 'easeInOut' };
  } else if (animState === 'loss') {
    // Loser drops back
    animateProps.y = 35;
    animateProps.x = isOpponent ? 40 : -40;
    animateProps.scaleY = 0.85;
    animateProps.opacity = 0.7;
    transitionProps = { type: 'spring', stiffness: 200, damping: 20 };
  } else if (animState === 'draw') {
    animateProps.y = -10;
    animateProps.scaleY = 1.05;
  }

  // Filter glows matching Dog of War gaming UI
  let filterGlow = isOpponent 
    ? 'drop-shadow(0 0 25px rgba(245, 158, 11, 0.5)) drop-shadow(0 15px 25px rgba(0,0,0,0.6))'
    : 'drop-shadow(0 0 25px rgba(59, 130, 246, 0.6)) drop-shadow(0 15px 25px rgba(0,0,0,0.6))';

  if (animState === 'win') {
    filterGlow = 'drop-shadow(0 0 40px rgba(16, 185, 129, 0.8)) drop-shadow(0 0 15px #10b981)';
  } else if (animState === 'loss') {
    filterGlow = 'drop-shadow(0 0 20px rgba(239, 68, 68, 0.4))';
  } else if (animState === 'draw') {
    filterGlow = 'drop-shadow(0 0 30px rgba(245, 158, 11, 0.7))';
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: isOpponent ? 'flex-end' : 'flex-start',
        position: 'relative',
        zIndex: isRevealed ? 10 : 1,
      }}
    >
      <motion.img
        key={`${animState}-${bouncePhase}`} // Retrigger bounce on beat
        src={assetSrc}
        alt={displayChoice}
        style={{
          height: '100%',
          width: 'auto',
          maxHeight: '100%',
          maxWidth: '100%',
          objectFit: 'contain',
          transformOrigin: 'bottom center',
          filter: filterGlow,
        }}
        initial={false}
        animate={animateProps}
        transition={transitionProps}
      />
    </div>
  );
}
