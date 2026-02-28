import React from 'react';
import { getScoreLabel } from '../engine/simulator';

interface ScoreGaugeProps {
  score: number;
  label: string;
  engine?: string;
  size?: 'small' | 'medium' | 'large';
  delta?: number;
}

const ENGINE_COLORS: Record<string, string> = {
  chatgpt: '#10b981',
  perplexity: '#3b82f6',
  google_aio: '#f59e0b',
};

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label, engine, size = 'medium', delta }) => {
  const { color } = getScoreLabel(score);
  const engineColor = engine ? ENGINE_COLORS[engine] || color : color;
  
  const dimensions = {
    small: { size: 80, stroke: 6, fontSize: 18, labelSize: 10 },
    medium: { size: 100, stroke: 7, fontSize: 22, labelSize: 11 },
    large: { size: 130, stroke: 9, fontSize: 32, labelSize: 13 },
  }[size];
  
  const radius = (dimensions.size - dimensions.stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', width: dimensions.size, height: dimensions.size }}>
        <svg width={dimensions.size} height={dimensions.size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background circle */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            fill="none"
            stroke="#1f1f1f"
            strokeWidth={dimensions.stroke}
          />
          {/* Score arc */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            fill="none"
            stroke={engineColor}
            strokeWidth={dimensions.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        {/* Score text */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: dimensions.fontSize, fontWeight: 800, color: engineColor, lineHeight: 1 }}>
            {score}
          </div>
          {delta !== undefined && delta !== 0 && (
            <div style={{
              fontSize: 10,
              color: delta > 0 ? '#22c55e' : '#ef4444',
              fontWeight: 600,
            }}>
              {delta > 0 ? '+' : ''}{delta}
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: dimensions.labelSize, color: '#9ca3af', textAlign: 'center', maxWidth: dimensions.size }}>
        {label}
      </div>
    </div>
  );
};

export default ScoreGauge;
