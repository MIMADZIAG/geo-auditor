import React, { useState, useCallback } from 'react';
import type { SimulationResult } from '../types/simulator';
import { runSimulation, getScoreLabel, getEngineName, estimateTotalImprovement } from '../engine/simulator';
import ScoreGauge from './ScoreGauge';
import EngineBreakdown from './EngineBreakdown';
import IssuesList from './IssuesList';
import WhatIfEditor from './WhatIfEditor';
import CitationProbabilityChart from './CitationProbabilityChart';
import RRFVisualizer from './RRFVisualizer';

// ============================================================
// Mock fetch for demo — replace with real API calls in production
// ============================================================
async function fetchPageData(url: string): Promise<{ html: string; robotsTxt: string }> {
  // In production: call your backend API to fetch and parse the URL
  // For demo purposes, returns a realistic mock based on URL patterns
  const mockHtml = `
    <html>
    <head>
      <title>Sample Product Page - Best Coffee Makers 2025</title>
      <meta name="description" content="Find the best coffee makers for your home.">
    </head>
    <body>
      <h1>Best Coffee Makers 2025</h1>
      <p>Looking for a great coffee maker? There are many options available on the market today that can help you brew the perfect cup.</p>
      <h2>Top Picks</h2>
      <p>We've tested over 50 coffee makers and these are our favorites. The machines vary in price from $50 to $500.</p>
      <h2>How to Choose</h2>
      <p>When choosing a coffee maker, consider your budget, how many cups you need, and what features matter most to you.</p>
    </body>
    </html>
  `;
  const mockRobotsTxt = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /`;
  
  return { html: mockHtml, robotsTxt: mockRobotsTxt };
}

// ============================================================
// Main AI Sandbox Component
// ============================================================

interface AISandboxProps {
  initialUrl?: string;
  isPremium?: boolean; // Controls What-If access (free vs paid)
  onUpgradeClick?: () => void;
}

const AISandbox: React.FC<AISandboxProps> = ({ 
  initialUrl = '', 
  isPremium = false,
  onUpgradeClick 
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [queries, setQueries] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(null);
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'chatgpt' | 'perplexity' | 'google' | 'whatif'>('overview');
  const [whatIfContent, setWhatIfContent] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { html, robotsTxt } = await fetchPageData(url);
      const targetQueries = queries
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      const result = runSimulation(
        { url, targetQueries, mode: 'analyze' },
        html,
        robotsTxt
      );
      
      setBaselineResult(result);
      setCurrentResult(result);
      setWhatIfContent(result.contentAnalysis.rawText.slice(0, 2000));
      setActiveTab('overview');
    } catch (err) {
      setError('Failed to analyze the URL. Please check the URL and try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [url, queries]);

  const handleWhatIfSimulate = useCallback(async () => {
    if (!baselineResult || !whatIfContent.trim()) return;
    
    setIsSimulating(true);
    
    try {
      const { html, robotsTxt } = await fetchPageData(url);
      const targetQueries = queries
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      const result = runSimulation(
        { url, targetQueries, contentOverride: whatIfContent, mode: 'simulate' },
        html,
        robotsTxt,
        baselineResult
      );
      
      setCurrentResult(result);
    } catch (err) {
      setError('Simulation failed. Please try again.');
    } finally {
      setIsSimulating(false);
    }
  }, [baselineResult, whatIfContent, url, queries]);

  const handleReset = () => {
    setCurrentResult(baselineResult);
    if (baselineResult) {
      setWhatIfContent(baselineResult.contentAnalysis.rawText.slice(0, 2000));
    }
  };

  const result = currentResult;
  const isWhatIfMode = result && baselineResult && result !== baselineResult;

  return (
    <div className="geo-sandbox" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerBadge}>
          <span style={styles.badgeDot}></span>
          AI Sandbox Simulator
        </div>
        <h2 style={styles.headerTitle}>
          Predict Your AI Citation Probability
        </h2>
        <p style={styles.headerSubtitle}>
          Powered by reverse-engineered ChatGPT RRF, Perplexity L3 XGBoost, and Google AI Overviews patent analysis
        </p>
      </div>

      {/* Input Section */}
      <div style={styles.inputSection}>
        <div style={styles.inputRow}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com/product-page"
            style={styles.urlInput}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            onClick={handleAnalyze}
            disabled={isLoading || !url.trim()}
            style={{
              ...styles.analyzeButton,
              opacity: isLoading || !url.trim() ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Analyzing...' : 'Run Simulation'}
          </button>
        </div>
        
        <div style={styles.queriesRow}>
          <textarea
            value={queries}
            onChange={e => setQueries(e.target.value)}
            placeholder="Target queries (one per line)&#10;e.g.: best coffee maker under $100&#10;how to choose coffee maker"
            style={styles.queriesInput}
            rows={3}
          />
        </div>
        
        {error && <div style={styles.errorBox}>{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <div style={styles.results}>
          
          {/* Score Overview */}
          <div style={styles.scoreRow}>
            <ScoreGauge
              score={result.overallScore}
              label="Overall AI Score"
              size="large"
              delta={isWhatIfMode ? result.deltaFromBaseline?.overallDelta : undefined}
            />
            <ScoreGauge
              score={result.chatgptScore}
              label="ChatGPT"
              engine="chatgpt"
              delta={isWhatIfMode ? result.deltaFromBaseline?.chatgptDelta : undefined}
            />
            <ScoreGauge
              score={result.perplexityScore}
              label="Perplexity"
              engine="perplexity"
              delta={isWhatIfMode ? result.deltaFromBaseline?.perplexityDelta : undefined}
            />
            <ScoreGauge
              score={result.googleAIOScore}
              label="Google AIO"
              engine="google_aio"
              delta={isWhatIfMode ? result.deltaFromBaseline?.googleAIODelta : undefined}
            />
          </div>

          {/* Citation Probability Banner */}
          <div style={styles.citationBanner}>
            <div style={styles.citationMain}>
              <span style={styles.citationNumber}>{result.citationProbability.overall}%</span>
              <span style={styles.citationLabel}>Overall Citation Probability</span>
            </div>
            <div style={styles.citationEngines}>
              {[
                { label: 'ChatGPT', value: result.citationProbability.chatgpt },
                { label: 'Perplexity', value: result.citationProbability.perplexity },
                { label: 'Google AIO', value: result.citationProbability.googleAIO },
              ].map(({ label, value }) => (
                <div key={label} style={styles.citationEngine}>
                  <span style={styles.citationEngineValue}>{value}%</span>
                  <span style={styles.citationEngineLabel}>{label}</span>
                </div>
              ))}
            </div>
            {result.issues.length > 0 && (
              <div style={styles.improvementHint}>
                Fix {result.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length} critical issues → 
                potential +{estimateTotalImprovement(result.issues.slice(0, 5))} points improvement
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={styles.tabs}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'chatgpt', label: 'ChatGPT RRF' },
              { id: 'perplexity', label: 'Perplexity L3' },
              { id: 'google', label: 'Google AIO' },
              { id: 'whatif', label: isPremium ? '⚡ What-If Editor' : '🔒 What-If Editor' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab.id ? styles.tabActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={styles.tabContent}>
            
            {activeTab === 'overview' && (
              <div>
                <IssuesList issues={result.issues} />
              </div>
            )}

            {activeTab === 'chatgpt' && (
              <EngineBreakdown
                engine="chatgpt"
                score={result.chatgptScore}
                analysis={result.rrfAnalysis}
                recommendation={result.rrfAnalysis.recommendation}
              >
                <RRFVisualizer rrfAnalysis={result.rrfAnalysis} />
              </EngineBreakdown>
            )}

            {activeTab === 'perplexity' && (
              <EngineBreakdown
                engine="perplexity"
                score={result.perplexityScore}
                analysis={result.perplexityAnalysis}
                recommendation={result.perplexityAnalysis.recommendation}
              />
            )}

            {activeTab === 'google' && (
              <EngineBreakdown
                engine="google_aio"
                score={result.googleAIOScore}
                analysis={result.googleAIOAnalysis}
                recommendation={result.googleAIOAnalysis.recommendation}
              />
            )}

            {activeTab === 'whatif' && (
              <WhatIfEditor
                isPremium={isPremium}
                content={whatIfContent}
                onContentChange={setWhatIfContent}
                onSimulate={handleWhatIfSimulate}
                onReset={handleReset}
                isSimulating={isSimulating}
                delta={result.deltaFromBaseline}
                onUpgradeClick={onUpgradeClick}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Inline Styles (dark theme matching GEO-Auditor)
// ============================================================
const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0a0a0a',
    borderRadius: '16px',
    border: '1px solid #1f1f1f',
    padding: '32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#e5e5e5',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  headerBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '20px',
    padding: '4px 16px',
    fontSize: '12px',
    color: '#a78bfa',
    marginBottom: '16px',
  },
  badgeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#a78bfa',
    display: 'inline-block',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: 700,
    margin: '0 0 8px',
    background: 'linear-gradient(135deg, #ffffff 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  headerSubtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  inputSection: {
    marginBottom: '32px',
  },
  inputRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
  },
  urlInput: {
    flex: 1,
    background: '#111111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#e5e5e5',
    fontSize: '14px',
    outline: 'none',
  },
  analyzeButton: {
    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  queriesRow: {
    width: '100%',
  },
  queriesInput: {
    width: '100%',
    background: '#111111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#6b7280',
    fontSize: '13px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#ef4444',
    fontSize: '14px',
    marginTop: '12px',
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  scoreRow: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  citationBanner: {
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(79, 70, 229, 0.1) 100%)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: '12px',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    flexWrap: 'wrap',
  },
  citationMain: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  citationNumber: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#a78bfa',
    lineHeight: 1,
  },
  citationLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  citationEngines: {
    display: 'flex',
    gap: '24px',
  },
  citationEngine: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  citationEngineValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e5e5e5',
  },
  citationEngineLabel: {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '2px',
  },
  improvementHint: {
    marginLeft: 'auto',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    color: '#22c55e',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    borderBottom: '1px solid #1f1f1f',
    paddingBottom: '0',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#6b7280',
    padding: '10px 16px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '-1px',
  },
  tabActive: {
    color: '#a78bfa',
    borderBottomColor: '#a78bfa',
  },
  tabContent: {
    paddingTop: '24px',
  },
};

export default AISandbox;
