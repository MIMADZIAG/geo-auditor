import React, { useState } from 'react';
import type { Issue } from '../types/simulator';

interface IssuesListProps {
  issues: Issue[];
}

const SEVERITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', label: 'CRITICAL', icon: '🚨' },
  high: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)', label: 'HIGH', icon: '⚠️' },
  medium: { color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.2)', label: 'MEDIUM', icon: '📋' },
  low: { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.2)', label: 'LOW', icon: 'ℹ️' },
};

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  google_aio: 'Google AIO',
  all: 'All Engines',
};

const IssueCard: React.FC<{ issue: Issue }> = ({ issue }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = SEVERITY_CONFIG[issue.severity];
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(issue.fix);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div style={{
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: '10px',
      marginBottom: '10px',
      overflow: 'hidden',
    }}>
      {/* Issue Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '16px', flexShrink: 0 }}>{config.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              background: config.color,
              color: '#fff',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {config.label}
            </span>
            <span style={{
              background: '#1f1f1f',
              color: '#6b7280',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '10px',
            }}>
              {ENGINE_LABELS[issue.engine] || issue.engine}
            </span>
            <span style={{
              background: '#1f1f1f',
              color: '#6b7280',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '10px',
            }}>
              {issue.category}
            </span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e5e5', marginTop: '6px' }}>
            {issue.title}
          </div>
          <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '3px' }}>
            +{issue.estimatedScoreImpact} pts potential improvement
          </div>
        </div>
        <span style={{ color: '#4b5563', fontSize: '12px', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${config.border}` }}>
          <div style={{ paddingTop: '12px' }}>
            <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, marginBottom: '12px' }}>
              {issue.description}
            </div>
            <div style={{
              background: 'rgba(34, 197, 94, 0.05)',
              border: '1px solid rgba(34, 197, 94, 0.15)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#22c55e',
              marginBottom: '12px',
            }}>
              Expected impact: {issue.impact}
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>
                Fix (copy-paste ready):
              </div>
              <pre style={{
                background: '#0a0a0a',
                border: '1px solid #2a2a2a',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                color: '#a78bfa',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}>
                {issue.fix}
              </pre>
              <button
                onClick={handleCopy}
                style={{
                  position: 'absolute',
                  top: '28px',
                  right: '8px',
                  background: '#1f1f1f',
                  border: '1px solid #2a2a2a',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: copied ? '#22c55e' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const IssuesList: React.FC<IssuesListProps> = ({ issues }) => {
  const critical = issues.filter(i => i.severity === 'critical');
  const high = issues.filter(i => i.severity === 'high');
  const medium = issues.filter(i => i.severity === 'medium');
  const low = issues.filter(i => i.severity === 'low');
  
  const totalImpact = issues.reduce((acc, i) => acc + i.estimatedScoreImpact, 0);
  
  return (
    <div>
      {/* Summary */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'Critical', count: critical.length, color: '#ef4444' },
          { label: 'High', count: high.length, color: '#f97316' },
          { label: 'Medium', count: medium.length, color: '#eab308' },
          { label: 'Low', count: low.length, color: '#6b7280' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            background: '#0f0f0f',
            border: '1px solid #1f1f1f',
            borderRadius: '8px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color }}>{count}</span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>{label}</span>
          </div>
        ))}
        <div style={{
          marginLeft: 'auto',
          background: 'rgba(34, 197, 94, 0.05)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '8px',
          padding: '8px 16px',
          fontSize: '13px',
          color: '#22c55e',
        }}>
          Fix all → +{Math.min(100, totalImpact)} pts potential
        </div>
      </div>
      
      {/* Issues */}
      {issues.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#22c55e',
          fontSize: '16px',
        }}>
          ✅ No significant issues found. This page is well-optimized for AI citation.
        </div>
      ) : (
        <div>
          {issues.map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
};

export default IssuesList;
