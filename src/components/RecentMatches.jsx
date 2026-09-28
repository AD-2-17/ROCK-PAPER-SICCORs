import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const CHOICES = [
  { id: 'rock', emoji: '✊', label: 'Rock' },
  { id: 'paper', emoji: '✋', label: 'Paper' },
  { id: 'scissors', emoji: '✌️', label: 'Scissors' },
];

const getChoiceEmoji = (choice) => CHOICES.find(c => c.id === choice)?.emoji || '❓';

export default function RecentMatches({ onBack }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const token = localStorage.getItem('dow_token');
        if (!token) throw new Error('Not authenticated');
        
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${API_URL}/api/matches`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to fetch matches');
        
        const result = await response.json();
        setMatches(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, []);

  return (
    <div className="matches" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <div className="matches__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="matches__title">Recent Matches</h1>
        <button className="btn btn--ghost" onClick={onBack}>← Back</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>}
      {error && <div style={{ color: '#ef4444', textAlign: 'center' }}>{error}</div>}
      {!loading && !error && matches.length === 0 && (
        <div className="matches__empty" style={{ textAlign: 'center', padding: '2rem' }}>
          No matches yet. Start playing!
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <div className="matches__list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {matches.map((match, index) => {
            const date = new Date(match.createdAt);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            let resultClass = '';
            if (match.result === 'win') resultClass = 'matches__result--win';
            else if (match.result === 'loss') resultClass = 'matches__result--loss';
            else resultClass = 'matches__result--draw';

            return (
              <motion.div 
                key={match.id || index}
                className="matches__item"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#1f2937', borderRadius: '0.5rem' }}
              >
                <div className="matches__item-left" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span className="matches__opponent" style={{ fontWeight: 'bold' }}>vs {match.opponent}</span>
                  <span className="matches__choices" style={{ fontSize: '1.2rem' }}>
                    {getChoiceEmoji(match.playerChoice)} vs {getChoiceEmoji(match.opponentChoice)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <span className={`matches__result ${resultClass}`} style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {match.result}
                  </span>
                  <span className="matches__date" style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                    {formattedDate}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
