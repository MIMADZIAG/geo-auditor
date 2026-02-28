import React from 'react';
import type { RRFAnalysis } from '../types/simulator';

interface RRFVisualizerProps {
  rrfAnalysis: RRFAnalysis;
}

const RRFVisualizer: React.FC<RRFVisualizerProps> = ({ rrfAnalysis }) => {
  const maxRRF = 1 / (60 + 1); // max possible RRF score (rank #1)
  
  return (
    <div style={{
      background: '#0f0f0f',
      border: '1px solid #1f1f1f',
      borderRadius: '12px',
      padding: '20px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px' }}>
        RRF Score Visualizer
      </div>
      <div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '16px' }}>
        Formula: 1 / (60 + rank_position) · Discovered in ChatGPT Chrome DevTools (rrf_alpha: 1, k=60)
      </div>
      
      {/* Query Variants */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rrfAnalysis.queryVariants.map((variant, i) => {
          const barWidth = (variant.rrfScore / maxRRF) * 100;
          const rankColor = variant.estimatedRank <= 5 ? '#22c55e' :
                            variant.estimatedRank <= 10 ? '#84cc16' :
                            variant.estimatedRank <= 20 ? '#eab308' : '#6b7280';
          
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {variant.queryVariant}
                </span>
                <div style={{ display: 'flex', gap: '12px', flexShrink: 0, marginLeft: '8px' }}>
                  <span style={{ fontSize: '11px', color: rankColor }}>
                    Rank #{variant.estimatedRank}
                  </span>
                  <span style={{ fontSize: '11px', color: '#a78bfa', fontFamily: 'monospace' }}>
                    {variant.rrfScore.toFixed(4)}
                  </span>
                </div>
              </div>
              <div style={{ background: '#1a1a1a', borderRadius: '3px', height: '5px', overflow: 'hidden' }}>
                <div style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: rankColor,
                  borderRadius: '3px',
                  transition: 'width 0.8s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Total */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #1f1f1f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Total RRF Score</div>
          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
            Sum of all query variant scores
          </div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
          {rrfAnalysis.totalRRFScore.toFixed(4)}
        </div>
      </div>
      
      {/* Context note */}
      <div style={{
        marginTop: '12px',
        background: 'rgba(16, 185, 129, 0.05)',
        border: '1px solid rgba(16, 185, 129, 0.15)',
        borderRadius: '6px',
        padding: '10px 12px',
        fontSize: '11px',
        color: '#6b7280',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: '#10b981' }}>RRF Math:</strong> Topic cluster (rank #4-8 for 10 queries) = RRF 0.154 vs. single keyword at #1 = RRF 0.0164. Cluster wins by <strong style={{ color: '#10b981' }}>9.4x</strong>. Consistency across query variants beats individual rankings.
      </div>
    </div>
  );
};

export default RRFVisualizer;
