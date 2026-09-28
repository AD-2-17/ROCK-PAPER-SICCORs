import React, { useRef, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// Preload all hand models
const MODEL_PATHS = {
  rock: '/assets/hands/ROCK.glb',
  paper: '/assets/hands/PAPER.glb',
  scissors: '/assets/hands/Siccor.glb',
};

// Preload models immediately on module load
Object.values(MODEL_PATHS).forEach(path => {
  useGLTF.preload(path);
});

// Individual hand model component
function HandModel({ choice, isOpponent = false, scale = 1, animate = false, animState = 'idle' }) {
  const groupRef = useRef();
  const modelPath = MODEL_PATHS[choice] || MODEL_PATHS.rock;
  const { scene } = useGLTF(modelPath);
  
  // Clone the scene so each instance is independent
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Compute bounding box to center and normalize the model
  const { center, normalizeScale } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return { center: c, normalizeScale: maxDim > 0 ? 2.0 / maxDim : 1 };
  }, [clonedScene]);

  // Idle floating animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    
    if (animate && animState === 'idle') {
      groupRef.current.position.y = Math.sin(t * 1.2) * 0.08;
      groupRef.current.rotation.y = Math.sin(t * 0.8) * 0.05;
    }
  });

  const flipX = isOpponent ? -1 : 1;

  return (
    <group ref={groupRef} scale={[normalizeScale * scale * flipX, normalizeScale * scale, normalizeScale * scale]}>
      <group rotation={[0, 0, -Math.PI / 2]}>
        <primitive 
          object={clonedScene} 
          position={[-center.x, -center.y, -center.z]}
        />
      </group>
    </group>
  );
}

// Mini hand preview for choice cards
export function HandPreview({ choice, isHovered = false, isSelected = false }) {
  const previewScale = isSelected ? 1.15 : isHovered ? 1.08 : 1.0;

  return (
    <Canvas
      camera={{ position: [0, 0.3, 3.5], fov: 35 }}
      style={{ 
        width: '100%', 
        height: '100%',
        pointerEvents: 'none',
      }}
      dpr={[1, 1.5]}
      gl={{ 
        antialias: true, 
        alpha: true,
        powerPreference: 'high-performance',
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-2, 2, -3]} intensity={0.3} color="#94a3b8" />
      {isSelected && (
        <pointLight position={[0, 0, 2]} intensity={0.5} color="#f59e0b" distance={5} />
      )}
      {isHovered && !isSelected && (
        <pointLight position={[0, 0, 2]} intensity={0.3} color="#60a5fa" distance={5} />
      )}
      <Suspense fallback={null}>
        <group scale={previewScale}>
          <HandModel choice={choice} scale={1} animate={true} animState="idle" />
        </group>
      </Suspense>
    </Canvas>
  );
}

// Main game hand display component
export function GameHand({ 
  choice = 'rock', 
  isOpponent = false,
  animState = 'idle', // idle, bounce, reveal, win, loss, draw
  bouncePhase = 0, // 0-3 for ROCK-PAPER-SCISSORS-SHOOT
  resultGlow = null, // 'win', 'loss', 'draw'
  opacity = 1,
  transitionKey = 'default',
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 4], fov: 30 }}
      style={{ 
        width: '100%', 
        height: '100%',
        opacity,
        transition: 'opacity 0.3s ease',
      }}
      dpr={[1, 2]}
      gl={{ 
        antialias: true, 
        alpha: true,
        powerPreference: 'high-performance',
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 5]} intensity={0.7} color="#ffffff" />
      <directionalLight position={[-3, 2, -2]} intensity={0.25} color="#94a3b8" />
      
      {/* Subtle rim light */}
      <pointLight position={isOpponent ? [3, 1, 0] : [-3, 1, 0]} intensity={0.2} color="#8b5cf6" distance={8} />
      
      {/* Result glow lights */}
      {resultGlow === 'win' && (
        <pointLight position={[0, 0, 3]} intensity={0.6} color="#10b981" distance={6} />
      )}
      {resultGlow === 'loss' && (
        <pointLight position={[0, -1, 2]} intensity={0.2} color="#ef4444" distance={4} />
      )}
      {resultGlow === 'draw' && (
        <pointLight position={[0, 0, 3]} intensity={0.4} color="#f59e0b" distance={5} />
      )}
      
      <Suspense fallback={null}>
        <AnimatedHand 
          choice={choice}
          isOpponent={isOpponent}
          animState={animState}
          bouncePhase={bouncePhase}
          resultGlow={resultGlow}
          transitionKey={transitionKey}
        />
      </Suspense>
      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.3}
        scale={5}
        blur={2}
        far={3}
      />
    </Canvas>
  );
}

// Animated hand with bounce and transition logic
function AnimatedHand({ choice, isOpponent, animState, bouncePhase, resultGlow, transitionKey }) {
  const groupRef = useRef();
  const targetPos = useRef(new THREE.Vector3(0, 0, 0));
  const targetRot = useRef(new THREE.Euler(0, 0, 0));
  const targetScale = useRef(new THREE.Vector3(1, 1, 1));
  const velocity = useRef(0);
  const prevAnimState = useRef(animState);
  const revealProgress = useRef(0);
  const prevChoice = useRef(choice);
  const transitionOpacity = useRef(1);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    
    const g = groupRef.current;
    const lerpSpeed = 8;

    if (animState === 'idle') {
      // Gentle floating
      targetPos.current.set(0, Math.sin(t * 1.5) * 0.06, 0);
      targetRot.current.set(0, Math.sin(t * 0.8) * 0.04, 0);
      targetScale.current.set(1, 1, 1);
    } else if (animState === 'bounce') {
      // Bounce animation for ROCK-PAPER-SCISSORS-SHOOT
      // bouncePhase controls which beat we're on
      const bounceY = Math.sin(t * 12) * 0.3;
      targetPos.current.set(0, bounceY, 0);
      targetRot.current.set(
        Math.sin(t * 12) * 0.15,
        0,
        0
      );
      targetScale.current.set(1, 1, 1);
    } else if (animState === 'anticipation') {
      // Pull back before reveal
      targetPos.current.set(0, 0.3, 0);
      targetRot.current.set(-0.2, 0, 0);
      targetScale.current.set(0.9, 0.9, 0.9);
    } else if (animState === 'reveal') {
      // Slam down for reveal
      revealProgress.current = Math.min(revealProgress.current + delta * 4, 1);
      const ease = 1 - Math.pow(1 - revealProgress.current, 3);
      targetPos.current.set(0, -0.1 * ease, 0.2 * ease);
      targetRot.current.set(0.1 * ease, 0, 0);
      targetScale.current.set(1.1, 1.1, 1.1);
    } else if (animState === 'win') {
      targetPos.current.set(0, Math.sin(t * 2) * 0.05 + 0.1, 0.1);
      targetRot.current.set(0, Math.sin(t * 1.5) * 0.05, 0.05);
      targetScale.current.set(1.2, 1.2, 1.2);
    } else if (animState === 'loss') {
      targetPos.current.set(0, -0.2, -0.1);
      targetRot.current.set(-0.1, 0, -0.05);
      targetScale.current.set(0.85, 0.85, 0.85);
    } else if (animState === 'draw') {
      targetPos.current.set(0, Math.sin(t * 2) * 0.03, 0);
      targetRot.current.set(0, Math.sin(t * 1.2) * 0.03, 0);
      targetScale.current.set(1.05, 1.05, 1.05);
    }

    // Smooth interpolation
    g.position.lerp(targetPos.current, delta * lerpSpeed);
    g.rotation.x += (targetRot.current.x - g.rotation.x) * delta * lerpSpeed;
    g.rotation.y += (targetRot.current.y - g.rotation.y) * delta * lerpSpeed;
    g.rotation.z += (targetRot.current.z - g.rotation.z) * delta * lerpSpeed;
    g.scale.lerp(targetScale.current, delta * lerpSpeed);

    if (prevAnimState.current !== animState) {
      prevAnimState.current = animState;
      if (animState === 'reveal') {
        revealProgress.current = 0;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <HandModel 
        choice={choice} 
        isOpponent={isOpponent}
        scale={1}
        animate={false}
      />
    </group>
  );
}

export default HandModel;
