import React, { useRef } from 'react';
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
  const hasEntered = useRef(false);
  const isRevealed = animState === 'reveal' || animState === 'win' || animState === 'loss' || animState === 'draw';
  
  // The countdown cycles through rock, paper, and scissors; the final selection
  // is only locked in once the reveal begins.
  const displayChoice = choice;
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

  const inwardDirection = isOpponent ? -1 : 1;
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
    // Hold at the screen edge after the one-time entrance.
    animateProps.rotate = 0;
    transitionProps = { type: 'spring', stiffness: 180, damping: 26 };
  } else if (animState === 'bounce') {
    // Each callout beat pivots around the wrist at the screen edge.
    // Left swings inward clockwise; right mirrors it anti-clockwise.
    animateProps.rotate = [0, inwardDirection * 11, inwardDirection * -2, 0];
    animateProps.y = [0, -14, 2, 0];
    animateProps.scaleY = [1, 1.018, 0.995, 1];
    transitionProps = {
      duration: 0.56,
      times: [0, 0.42, 0.78, 1],
      ease: [0.4, 0, 0.2, 1],
    };
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
        key={`${displayChoice}-${animState}-${bouncePhase}`} // Retrigger each countdown beat
        src={assetSrc}
        alt={displayChoice}
        style={{
          height: '100%',
          width: 'auto',
          maxHeight: '100%',
          maxWidth: '100%',
          objectFit: 'contain',
          transformOrigin: isOpponent ? '100% 100%' : '0% 100%',
          filter: filterGlow,
        }}
        initial={hasEntered.current ? false : {
          x: isOpponent ? 130 : -130,
          rotate: isOpponent ? -14 : 14,
          opacity: 0.45,
        }}
        animate={animateProps}
        transition={transitionProps}
        onAnimationComplete={() => { hasEntered.current = true; }}
      />
    </div>
  );
}
