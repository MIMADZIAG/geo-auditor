import React from 'react';
import type { RRFAnalysis, PerplexityL3Analysis, GoogleAIOAnalysis } from '../types/simulator';

interface EngineBreakdownProps {
  engine: 'chatgpt' | 'perplexity' | 'google_aio';
  score: number;
  analysis: RRFAnalysis | PerplexityL3Analysis | GoogleAIOAnalysis;
  recommendation: string;
  children?: React.ReactNode;
}

const ENGINE_CONFIG = {
  chatgpt: {
    name: 'ChatGPT',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.05)',
    border: 'rgba(16, 185, 129, 0.2)',
    icon: '🤖',
    algorithm: 'Reciprocal Rank Fusion (RRF)',
    source: 'Discovered in ChatGPT Chrome DevTools (Yesilyurt, 2025)',
  },
  perplexity: {
    name: 'Perplexity',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.05)',
    border: 'rgba(59, 130, 246, 0.2)',
    icon: '🔍',
    algorithm: 'L3 XGBoost Reranker',
    source: 'Reverse-engineered from Perplexity infrastructure (Yesilyurt, 2026)',
  },
  google_aio: {
    name: 'Google AI Overviews',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.05)',
    border: 'rgba(245, 158, 11, 0.2)',
    icon: '🌐',
    algorithm: 'Query Fan-Out + Pairwise Passage Ranking',
    source: '6 Google patents analyzed (King, 2025, Search Engine Land)',
  },
};

const MetricBar: React.FC<{ label: string; value: number; color: string; description?: string }> = ({
  label, value, color, description
}) => (
  <div style={{ marginBottom: '12px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ fontSize: '13px', color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color }}>{value}/100</span>
    </div>
    <div style={{ background: '#1f1f1f', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
      <div style={{
        width: `${value}%`,
        height: '100%',
        background: color,
        borderRadius: '4px',
        transition: 'width 0.8s ease',
      }} />
    </div>
    {description && (
      <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '3px' }}>{description}</div>
    )}
  </div>
);

const EngineBreakdown: React.FC<EngineBreakdownProps> = ({
  engine, score, analysis, recommendation, children
}) => {
  const config = ENGINE_CONFIG[engine];
  
  const renderMetrics = () => {
    if (engine === 'chatgpt') {
      const rrf = analysis as RRFAnalysis;
      return (
        <>
          <MetricBar label="Topical Coverage" value={rrf.topicalCoverageScore} color={config.color}
            description="% of query variants this page ranks for (RRF rewards consistency across variants)" />
          <MetricBar label="Rank Consistency" value={rrf.consistencyScore} color={config.color}
            description="Variance in rank positions across query variants (lower variance = higher RRF score)" />
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
              Total RRF Score: <strong style={{ color: config.color }}>{rrf.totalRRFScore}</strong>
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#4b5563' }}>
                (Formula: Σ 1/(60 + rank_position) across all query variants)
              </span>
            </div>
          </div>
        </>
      );
    }
    
    if (engine === 'perplexity') {
      const p = analysis as PerplexityL3Analysis;
      return (
        <>
          <MetricBar label="L3 Reranker Score" value={p.l3RerankerScore} color={config.color}
            description={`Quality gate threshold: ~55. Status: ${p.passesQualityGate ? '✅ Passes' : '❌ Dropped'}`} />
          <MetricBar label="Answer-First Structure" value={p.answerFirstScore} color={config.color}
            description="Direct answer in ≤80 tokens at content start (required by Perplexity L3)" />
          <MetricBar label="Entity Disambiguation" value={p.entityDisambiguationScore} color={config.color}
            description="Are key entities clearly defined? (XGBoost feature)" />
          <MetricBar label="Numerical Density" value={p.numericalDensityScore} color={config.color}
            description="% of content containing specific numbers/units" />
          <MetricBar label="Authority Proximity" value={p.authorityDomainProximity} color={config.color}
            description="Links to Perplexity's manually curated authority domains" />
          <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={pillStyle(config.color)}>
              Topic Multiplier: {p.topicMultiplierValue}x ({p.topicMultiplierCategory})
            </div>
            <div style={pillStyle(p.timeDecayRisk === 'low' ? '#22c55e' : p.timeDecayRisk === 'medium' ? '#f59e0b' : '#ef4444')}>
              Time Decay Risk: {p.timeDecayRisk}
            </div>
            <div style={pillStyle(p.newPostCTRPotential > 60 ? '#22c55e' : '#6b7280')}>
              CTR Potential: {p.newPostCTRPotential}%
            </div>
          </div>
        </>
      );
    }
    
    if (engine === 'google_aio') {
      const g = analysis as GoogleAIOAnalysis;
      return (
        <>
          <MetricBar label="Query Fan-Out Coverage" value={g.queryFanOutCoverage} color={config.color}
            description="% of synthetic query types covered (definitional, procedural, comparative, evaluative, factual)" />
          <MetricBar label="Passage Verifiability" value={g.passageVerifiabilityScore} color={config.color}
            description="Can passages verify pre-generated AI claims? (generate-first patent)" />
          <MetricBar label="Chunkability" value={g.chunkabilityScore} color={config.color}
            description="% of paragraphs in optimal 200-400 word self-contained chunks" />
          <MetricBar label="Semantic Triple Clarity" value={g.semanticTripleScore} color={config.color}
            description="Entity-relation-entity clarity (e.g., 'X is Y', 'X does Z')" />
          <MetricBar label="Pairwise Ranking Score" value={g.pairwiseRankingScore} color={config.color}
            description="Estimated score in head-to-head passage comparison (directness + specificity)" />
          {g.syntheticQueryCoverage.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                Inferred synthetic queries Google may generate:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {g.syntheticQueryCoverage.slice(0, 6).map((q, i) => (
                  <span key={i} style={pillStyle('#4b5563')}>{q}</span>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }
    
    return null;
  };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Engine Header */}
      <div style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '12px',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: config.color, marginBottom: '4px' }}>
              {config.icon} {config.name}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Algorithm: <strong style={{ color: '#9ca3af' }}>{config.algorithm}</strong>
            </div>
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
              Source: {config.source}
            </div>
          </div>
          <div style={{ fontSize: '40px', fontWeight: 800, color: config.color }}>{score}</div>
        </div>
      </div>
      
      {/* Metrics */}
      <div style={{ background: '#0f0f0f', borderRadius: '12px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '16px' }}>
          Algorithm Signals
        </div>
        {renderMetrics()}
      </div>
      
      {/* Children (e.g., RRF Visualizer) */}
      {children && <div>{children}</div>}
      
      {/* Recommendation */}
      <div style={{
        background: 'rgba(139, 92, 246, 0.05)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '12px',
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa', marginBottom: '8px' }}>
          💡 Recommendation
        </div>
        <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>
          {recommendation}
        </div>
      </div>
    </div>
  );
};

function pillStyle(color: string): React.CSSProperties {
  return {
    background: `${color}15`,
    border: `1px solid ${color}40`,
    borderRadius: '20px',
    padding: '3px 10px',
    fontSize: '11px',
    color,
  };
}

export default EngineBreakdown;
