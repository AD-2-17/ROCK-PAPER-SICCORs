import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Leaderboard({ onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const token = localStorage.getItem('dow_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const API_URL = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${API_URL}/api/leaderboard`, { headers });
        
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="leaderboard" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="leaderboard__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="leaderboard__title">Leaderboard</h1>
        <button className="btn btn--ghost" onClick={onBack}>← Back</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>}
      {error && <div style={{ color: '#ef4444', textAlign: 'center' }}>{error}</div>}
      {!loading && !error && data.length === 0 && <div className="leaderboard__empty" style={{ textAlign: 'center' }}>No players yet</div>}

      {!loading && !error && data.length > 0 && (
        <table className="leaderboard__table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={{ padding: '1rem' }}>Rank</th>
              <th style={{ padding: '1rem' }}>Player</th>
              <th style={{ padding: '1rem' }}>Wins</th>
              <th style={{ padding: '1rem' }}>Losses</th>
              <th style={{ padding: '1rem' }}>Draws</th>
              <th style={{ padding: '1rem' }}>Games</th>
            </tr>
          </thead>
          <tbody>
            {data.map((player, index) => (
              <motion.tr 
                key={player.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                style={{ borderBottom: '1px solid #222' }}
              >
                <td className={`leaderboard__rank leaderboard__rank--${index + 1}`} style={{ padding: '1rem' }}>
                  #{index + 1}
                </td>
                <td className="leaderboard__username" style={{ padding: '1rem', fontWeight: 'bold' }}>{player.username}</td>
                <td style={{ padding: '1rem', color: '#10b981' }}>{player.wins}</td>
                <td style={{ padding: '1rem', color: '#ef4444' }}>{player.losses}</td>
                <td style={{ padding: '1rem', color: '#fbbf24' }}>{player.draws}</td>
                <td style={{ padding: '1rem' }}>{player.gamesPlayed || (player.wins + player.losses + player.draws)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
