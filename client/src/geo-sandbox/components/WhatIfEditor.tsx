import React from 'react';
import type { ScoreDelta } from '../types/simulator';

interface WhatIfEditorProps {
  isPremium: boolean;
  content: string;
  onContentChange: (content: string) => void;
  onSimulate: () => void;
  onReset: () => void;
  isSimulating: boolean;
  delta?: ScoreDelta;
  onUpgradeClick?: () => void;
}

const DeltaBadge: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  return (
    <div style={{
      background: isNeutral ? '#1f1f1f' : isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      border: `1px solid ${isNeutral ? '#2a2a2a' : isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
      borderRadius: '8px',
      padding: '8px 16px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '20px',
        fontWeight: 800,
        color: isNeutral ? '#6b7280' : isPositive ? '#22c55e' : '#ef4444',
      }}>
        {isPositive ? '+' : ''}{value}
      </div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{label}</div>
    </div>
  );
};

const WhatIfEditor: React.FC<WhatIfEditorProps> = ({
  isPremium,
  content,
  onContentChange,
  onSimulate,
  onReset,
  isSimulating,
  delta,
  onUpgradeClick,
}) => {
  
  // WhatIfEditor is available to all users in this version
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(139, 92, 246, 0.05)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '10px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>⚡</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#a78bfa' }}>What-If Simulator</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Edit content below and click "Run Simulation" to see the predicted impact on your AI scores before going live.
          </div>
        </div>
      </div>
      
      {/* Delta Results (shown after simulation) */}
      {delta && (
        <div style={{
          background: '#0f0f0f',
          border: '1px solid #1f1f1f',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '16px' }}>
            Simulation Results — Score Delta
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <DeltaBadge label="Overall" value={delta.overallDelta} />
            <DeltaBadge label="ChatGPT" value={delta.chatgptDelta} />
            <DeltaBadge label="Perplexity" value={delta.perplexityDelta} />
            <DeltaBadge label="Google AIO" value={delta.googleAIODelta} />
            <DeltaBadge label="Citation Prob." value={delta.citationProbabilityDelta} />
          </div>
          
          {delta.improvedIssues.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#22c55e', marginBottom: '6px' }}>
                ✅ Issues resolved by your changes:
              </div>
              {delta.improvedIssues.map((issue, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#6b7280', marginBottom: '3px' }}>
                  • {issue}
                </div>
              ))}
            </div>
          )}
          
          {delta.remainingIssues.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: '#f97316', marginBottom: '6px' }}>
                ⚠️ Remaining issues:
              </div>
              {delta.remainingIssues.slice(0, 3).map((issue, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#6b7280', marginBottom: '3px' }}>
                  • {issue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Editor */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}>
          Content Editor
          <span style={{ fontSize: '11px', color: '#4b5563', marginLeft: '8px', fontWeight: 400 }}>
            Edit your page content here. Changes are simulated — your live site is not affected.
          </span>
        </div>
        <textarea
          value={content}
          onChange={e => onContentChange(e.target.value)}
          style={{
            width: '100%',
            minHeight: '300px',
            background: '#0a0a0a',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            padding: '16px',
            color: '#e5e5e5',
            fontSize: '13px',
            lineHeight: 1.7,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
          placeholder="Paste or edit your page content here..."
        />
      </div>
      
      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={onSimulate}
          disabled={isSimulating}
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: isSimulating ? 'not-allowed' : 'pointer',
            opacity: isSimulating ? 0.7 : 1,
          }}
        >
          {isSimulating ? '⚡ Simulating...' : '⚡ Run Simulation'}
        </button>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            color: '#6b7280',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Reset to Baseline
        </button>
      </div>
      
      {/* Algorithm Note */}
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '11px',
        color: '#4b5563',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: '#6b7280' }}>How simulation works:</strong> The engine applies reverse-engineered scoring models for ChatGPT (RRF formula from Chrome DevTools), Perplexity (L3 XGBoost quality gate parameters), and Google AI Overviews (6 patents: query fan-out, pairwise passage ranking, generate-first verification). Scores are estimates based on known algorithmic signals — not API calls to live models.
      </div>
    </div>
  );
};

export default WhatIfEditor;
