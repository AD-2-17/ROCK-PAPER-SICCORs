import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const heroMotion = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

export default function Landing({ onNavigate }) {
  const { user } = useAuth();

  const handlePrimaryClick = () => {
    onNavigate(user ? 'lobby' : 'login');
  };

  return (
    <main className="landing landing--arena">
      <div className="landing__art" aria-hidden="true">
        <img className="landing__art-hand landing__art-hand--rock" src="/assets/hands/rock.png" alt="" />
        <img className="landing__art-hand landing__art-hand--scissors" src="/assets/hands/scissors.png" alt="" />
      </div>

      <motion.section
        className="landing__hero"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
      >
        <motion.div className="landing__eyebrow" variants={heroMotion}>
          <span className="landing__eyebrow-dot" /> Live arena
        </motion.div>
        <motion.div className="landing__crest" variants={heroMotion} aria-hidden="true">D</motion.div>
        <motion.h1 className="landing__title" variants={heroMotion}>
          DOG <span>OF</span> WAR
        </motion.h1>
        <motion.p className="landing__tagline" variants={heroMotion}>
          Rock. Paper. Scissors. A quick game with a little bite.
        </motion.p>
        <motion.div className="landing__ctas" variants={heroMotion}>
          <button className="btn btn--primary btn--xl" onClick={handlePrimaryClick}>Find match</button>
          <button className="btn btn--secondary btn--xl" onClick={handlePrimaryClick}>Private room</button>
        </motion.div>
        <motion.div className="landing__rule-strip" variants={heroMotion}>
          <span>Rock breaks scissors</span>
          <span>Paper covers rock</span>
          <span>Scissors cut paper</span>
        </motion.div>
      </motion.section>
    </main>
  );
}
