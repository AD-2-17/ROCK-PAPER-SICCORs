import React, { useMemo } from 'react';

export default function ParticleBackground() {
  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      arr.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        opacity: Math.random() * 0.3 + 0.1,
        duration: Math.random() * 25 + 15,
        delay: Math.random() * 20,
      });
    }
    return arr;
  }, []);

  return (
    <div className="particles">
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            '--particle-opacity': p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `-${p.delay}s`
          }}
        />
      ))}
    </div>
  );
}
