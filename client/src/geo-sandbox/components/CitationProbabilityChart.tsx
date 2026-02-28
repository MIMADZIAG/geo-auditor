import React from 'react';
import type { CitationProbability } from '../types/simulator';

interface CitationProbabilityChartProps {
  data: CitationProbability;
}

const CitationProbabilityChart: React.FC<CitationProbabilityChartProps> = ({ data }) => {
  const engines = [
    { key: 'chatgpt', label: 'ChatGPT', value: data.chatgpt, color: '#10b981' },
    { key: 'perplexity', label: 'Perplexity', value: data.perplexity, color: '#3b82f6' },
    { key: 'googleAIO', label: 'Google AIO', value: data.googleAIO, color: '#f59e0b' },
  ];
  
  return (
    <div style={{
      background: '#0f0f0f',
      border: '1px solid #1f1f1f',
      borderRadius: '12px',
      padding: '20px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '16px' }}>
        Citation Probability by Engine
      </div>
      
      {engines.map(({ key, label, value, color }) => (
        <div key={key} style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>{label}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}%</span>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${value}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${color}80, ${color})`,
              borderRadius: '6px',
              transition: 'width 1s ease',
            }} />
          </div>
        </div>
      ))}
      
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #1f1f1f',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>Overall Citation Probability</span>
        <span style={{ fontSize: '28px', fontWeight: 800, color: '#a78bfa' }}>{data.overall}%</span>
      </div>
    </div>
  );
};

export default CitationProbabilityChart;
