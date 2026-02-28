// ============================================================
// GEO-Auditor — Scoring Engine
// Computes per-engine citation probability scores
// Based on reverse-engineered algorithm profiles
// ============================================================

import type {
  ContentAnalysis,
  TechnicalAnalysis,
  RRFAnalysis,
  PerplexityL3Analysis,
  GoogleAIOAnalysis,
  CitationProbability,
  QueryCitationEstimate,
  RRFScore,
} from '../types/simulator';
import {
  CHATGPT_RRF_PARAMS,
  PERPLEXITY_PARAMS,
  GOOGLE_AIO_PARAMS,
  SCORING_WEIGHTS,
  TOPIC_KEYWORDS,
} from '../data/algorithmProfiles';

// ============================================================
// CHATGPT RRF SCORING
// ============================================================

function computeRRFScore(rank: number): number {
  return 1 / (CHATGPT_RRF_PARAMS.k_constant + rank);
}

export function scoreChatGPT(
  content: ContentAnalysis,
  technical: TechnicalAnalysis,
  targetQueries: string[]
): { score: number; analysis: RRFAnalysis } {
  
  // Estimate rank for each query variant based on content signals
  const queryVariants: RRFScore[] = targetQueries.map((query, index) => {
    let estimatedRank = 15; // default rank
    
    // Improve rank based on content signals
    if (content.hasAnswerFirst) estimatedRank -= 3;
    if (content.hasStatistics) estimatedRank -= 2;
    if (content.hasCitations) estimatedRank -= 3;
    if (content.hasComparisonTable) estimatedRank -= 2;
    if (content.hasFAQSection) estimatedRank -= 1;
    if (content.totalWordCount > 3000) estimatedRank -= 2;
    if (content.totalWordCount > 8000) estimatedRank -= 2;
    if (content.readabilityScore > 55) estimatedRank -= 1;
    if (technical.schemaMarkup.completenessScore > 70) estimatedRank -= 2;
    
    // Penalize for blocked bots
    if (technical.blockedBots.includes('OAI-SearchBot') || 
        technical.blockedBots.includes('GPTBot')) {
      estimatedRank += 10;
    }
    
    // Position bias: first-third content gets more citations
    const firstThirdChunks = content.chunks.slice(0, Math.ceil(content.chunks.length / 3));
    const firstThirdQuality = firstThirdChunks.reduce((acc, c) => acc + c.chunkabilityScore, 0) / 
                               Math.max(firstThirdChunks.length, 1);
    if (firstThirdQuality > 70) estimatedRank -= 2;
    
    estimatedRank = Math.max(1, Math.min(50, estimatedRank));
    
    return {
      queryVariant: query,
      estimatedRank,
      rrfScore: computeRRFScore(estimatedRank),
    };
  });
  
  const totalRRFScore = queryVariants.reduce((acc, v) => acc + v.rrfScore, 0);
  
  // Topical coverage: how many query variants does content cover?
  const coveredQueries = queryVariants.filter(v => v.estimatedRank <= 20).length;
  const topicalCoverageScore = Math.round((coveredQueries / Math.max(queryVariants.length, 1)) * 100);
  
  // Consistency: are ranks consistent across variants? (RRF rewards consistency)
  const ranks = queryVariants.map(v => v.estimatedRank);
  const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const variance = ranks.reduce((acc, r) => acc + Math.pow(r - avgRank, 2), 0) / ranks.length;
  const consistencyScore = Math.max(0, 100 - Math.round(variance));
  
  // Compute final ChatGPT score (0-100)
  let score = 0;
  score += topicalCoverageScore * SCORING_WEIGHTS.chatgpt.rrf_topical_coverage;
  score += consistencyScore * SCORING_WEIGHTS.chatgpt.content_structure;
  
  // Content structure bonus
  let structureScore = 50;
  if (content.hasAnswerFirst) structureScore += 15;
  if (content.hasStatistics) structureScore += 10;
  if (content.hasCitations) structureScore += 15;
  if (content.hasComparisonTable) structureScore += 10;
  score += structureScore * SCORING_WEIGHTS.chatgpt.content_structure;
  
  // Technical access
  const techScore = technical.blockedBots.includes('OAI-SearchBot') ? 10 :
                    technical.blockedBots.includes('GPTBot') ? 60 : 90;
  score += techScore * SCORING_WEIGHTS.chatgpt.technical_access;
  
  // Authority signals
  let authorityScore = 50;
  if (content.hasCitations) authorityScore += 20;
  if (technical.schemaMarkup.hasPerson) authorityScore += 10;
  if (technical.schemaMarkup.hasOrganization) authorityScore += 10;
  score += authorityScore * SCORING_WEIGHTS.chatgpt.authority_signals;
  
  // Freshness
  const freshnessScore = content.contentFreshness === 'fresh' ? 90 :
                          content.contentFreshness === 'recent' ? 70 :
                          content.contentFreshness === 'stale' ? 30 : 50;
  score += freshnessScore * SCORING_WEIGHTS.chatgpt.freshness;
  
  score = Math.round(Math.min(100, score));
  
  // Generate recommendation
  let recommendation = '';
  if (topicalCoverageScore < 50) {
    recommendation = 'Expand content to cover more query variants. ChatGPT uses RRF to combine results from multiple query reformulations — ranking #4 for 10 queries beats ranking #1 for 2 queries by 5x.';
  } else if (!content.hasStatistics) {
    recommendation = 'Add specific statistics and data points. Content with statistics receives 22% more AI citations.';
  } else if (!content.hasCitations) {
    recommendation = 'Add citations to authoritative sources. Cited content receives 37% more AI visibility.';
  } else {
    recommendation = 'Good ChatGPT optimization. Focus on expanding topical coverage with related subtopic pages.';
  }
  
  return {
    score,
    analysis: {
      totalRRFScore: Math.round(totalRRFScore * 10000) / 10000,
      queryVariants,
      topicalCoverageScore,
      consistencyScore,
      recommendation,
    }
  };
}

// ============================================================
// PERPLEXITY L3 SCORING
// ============================================================

export function scorePerplexity(
  content: ContentAnalysis,
  technical: TechnicalAnalysis
): { score: number; analysis: PerplexityL3Analysis } {
  
  // 1. Answer-First Score (≤80 tokens, direct answer)
  const firstChunk = content.chunks[0];
  const firstChunkTokens = firstChunk ? firstChunk.wordCount : 0;
  const answerFirstScore = content.hasAnswerFirst && firstChunkTokens <= 80 ? 90 :
                            content.hasAnswerFirst ? 70 :
                            firstChunkTokens <= 120 ? 40 : 20;
  
  // 2. Entity Disambiguation Score
  const hasEntityDefinitions = content.headingStructure.some(h => 
    /what is|definition|meaning|overview/i.test(h.text)
  );
  const entityDisambiguationScore = hasEntityDefinitions ? 80 :
                                     content.entityMentions.length > 5 ? 60 : 40;
  
  // 3. Numerical Density Score
  const numbers = content.rawText.match(/\d+/g) || [];
  const numericalDensity = numbers.length / Math.max(content.totalWordCount, 1);
  const numericalDensityScore = numericalDensity >= 0.05 ? 90 :
                                  numericalDensity >= 0.02 ? 70 :
                                  numericalDensity >= 0.01 ? 50 : 30;
  
  // 4. Topic Multiplier
  let topicMultiplierCategory: 'high' | 'medium' | 'low' | 'restricted' = 'low';
  let topicMultiplierValue = 1.0;
  
  const lowerText = content.rawText.toLowerCase();
  const highKeywords = TOPIC_KEYWORDS.high_multiplier.filter(kw => lowerText.includes(kw));
  const restrictedKeywords = TOPIC_KEYWORDS.restricted.filter(kw => lowerText.includes(kw));
  
  if (restrictedKeywords.length > 3) {
    topicMultiplierCategory = 'restricted';
    topicMultiplierValue = 0.3;
  } else if (highKeywords.length >= 3) {
    topicMultiplierCategory = 'high';
    topicMultiplierValue = 2.5;
  } else if (content.topicCategory === 'ecommerce') {
    topicMultiplierCategory = 'medium';
    topicMultiplierValue = 1.5;
  }
  
  // 5. Authority Domain Proximity
  const allAuthorityDomains = Object.values(PERPLEXITY_PARAMS.authorityDomains).flat();
  const linkedDomains = allAuthorityDomains.filter(domain => 
    content.rawText.toLowerCase().includes(domain.replace('.com', '').replace('.org', ''))
  );
  const authorityDomainProximity = Math.min(100, linkedDomains.length * 15 + 20);
  
  // 6. New Post CTR Potential
  const hasEngagingHeadline = content.headingStructure.some(h => 
    /\d+|best|top|how to|why|secret|revealed|guide|complete/i.test(h.text)
  );
  const newPostCTRPotential = hasEngagingHeadline ? 70 : 
                               content.hasStatistics ? 60 : 40;
  
  // 7. Time Decay Risk
  const timeDecayRisk: 'low' | 'medium' | 'high' = 
    content.contentFreshness === 'fresh' ? 'low' :
    content.contentFreshness === 'recent' ? 'medium' : 'high';
  
  // 8. L3 Reranker Score (overall quality gate)
  let l3Score = 0;
  l3Score += answerFirstScore * 0.30;
  l3Score += entityDisambiguationScore * 0.20;
  l3Score += numericalDensityScore * 0.25;
  l3Score += (content.hasStatistics ? 80 : 30) * 0.15;
  l3Score += (content.hasCitations ? 80 : 30) * 0.10;
  
  const l3RerankerScore = Math.round(l3Score);
  const passesQualityGate = l3RerankerScore >= 55; // estimated drop threshold
  
  // Final Perplexity Score
  let score = 0;
  score += l3RerankerScore * SCORING_WEIGHTS.perplexity.l3_quality_gate;
  score += answerFirstScore * SCORING_WEIGHTS.perplexity.answer_first_structure;
  score += (topicMultiplierValue / 2.5) * 100 * SCORING_WEIGHTS.perplexity.topic_multiplier;
  score += authorityDomainProximity * SCORING_WEIGHTS.perplexity.authority_proximity;
  
  const freshnessScore = content.contentFreshness === 'fresh' ? 90 :
                          content.contentFreshness === 'recent' ? 70 :
                          content.contentFreshness === 'stale' ? 20 : 50;
  score += freshnessScore * SCORING_WEIGHTS.perplexity.freshness;
  
  // Penalize if bot is blocked
  if (technical.blockedBots.includes('PerplexityBot')) {
    score *= 0.1;
  }
  
  score = Math.round(Math.min(100, score));
  
  // Recommendation
  let recommendation = '';
  if (!passesQualityGate) {
    recommendation = `Content fails Perplexity's L3 quality gate (score: ${l3RerankerScore}/100, threshold: ~55). Fix: Open with a direct answer in ≤80 tokens, add a "Because:" line with a concrete number, and define key entities explicitly.`;
  } else if (topicMultiplierCategory === 'restricted') {
    recommendation = 'Topic category has a low multiplier in Perplexity. Reframe content toward business/technology angles to benefit from higher visibility multipliers.';
  } else if (timeDecayRisk === 'high') {
    recommendation = 'Content freshness is low. Perplexity applies exponential time decay — update content and add a visible "Last updated" date to reset the decay curve.';
  } else {
    recommendation = 'Good Perplexity optimization. Increase authority domain proximity by linking to curated sources (Reddit, GitHub, Amazon) relevant to your topic.';
  }
  
  return {
    score,
    analysis: {
      l3RerankerScore,
      answerFirstScore,
      entityDisambiguationScore,
      numericalDensityScore,
      topicMultiplierCategory,
      topicMultiplierValue,
      authorityDomainProximity,
      newPostCTRPotential,
      timeDecayRisk,
      passesQualityGate,
      recommendation,
    }
  };
}

// ============================================================
// GOOGLE AI OVERVIEWS SCORING
// ============================================================

export function scoreGoogleAIO(
  content: ContentAnalysis,
  technical: TechnicalAnalysis,
  targetQueries: string[]
): { score: number; analysis: GoogleAIOAnalysis } {
  
  // 1. Query Fan-Out Coverage
  // Google generates synthetic queries — content must cover multiple intent types
  const syntheticQueryTypes = ['definitional', 'procedural', 'comparative', 'evaluative', 'factual'];
  const coveredTypes: string[] = [];
  
  if (content.headingStructure.some(h => /what is|definition|overview/i.test(h.text))) {
    coveredTypes.push('definitional');
  }
  if (content.hasHowToSection || content.headingStructure.some(h => /how to|steps|guide/i.test(h.text))) {
    coveredTypes.push('procedural');
  }
  if (content.hasComparisonTable || content.headingStructure.some(h => /vs\.|compare|difference/i.test(h.text))) {
    coveredTypes.push('comparative');
  }
  if (content.hasFAQSection || content.hasStatistics) {
    coveredTypes.push('factual');
  }
  if (content.headingStructure.some(h => /best|top|review|recommend/i.test(h.text))) {
    coveredTypes.push('evaluative');
  }
  
  const queryFanOutCoverage = Math.round((coveredTypes.length / syntheticQueryTypes.length) * 100);
  
  // Infer synthetic queries from content
  const syntheticQueryCoverage = targetQueries.flatMap(q => [
    `what is ${q}`,
    `how to ${q}`,
    `best ${q}`,
    `${q} vs alternatives`,
    `${q} guide`,
  ]).slice(0, 10);
  
  // 2. Passage Verifiability Score
  // Google generates answer first, then verifies against passages
  // Passages must be: precise, factual, non-hedging, directly supportive
  let verifiabilityScore = 50;
  if (content.hasStatistics) verifiabilityScore += 15;
  if (content.hasCitations) verifiabilityScore += 15;
  if (content.hasAnswerFirst) verifiabilityScore += 10;
  // Penalize hedging language
  const hedgingPhrases = content.rawText.match(/might|could|possibly|perhaps|may|seems to|appears to/gi) || [];
  verifiabilityScore -= Math.min(20, hedgingPhrases.length * 2);
  const passageVerifiabilityScore = Math.max(0, Math.min(100, verifiabilityScore));
  
  // 3. Chunkability Score
  // Optimal: 200-400 word self-contained paragraphs [NVIDIA benchmark]
  const optimalChunks = content.chunks.filter(c => 
    c.wordCount >= 200 && c.wordCount <= 400 && c.isSelfContained
  );
  const chunkabilityScore = Math.round(
    (optimalChunks.length / Math.max(content.chunks.length, 1)) * 100
  );
  
  // 4. Semantic Triple Score (entity-relation-entity clarity)
  // Content should contain clear factual statements: "X is Y", "X does Z"
  const semanticTriples = content.rawText.match(/[A-Z][^.!?]*\s+is\s+[^.!?]+[.!?]/g) || [];
  const semanticTripleScore = Math.min(100, semanticTriples.length * 10 + 30);
  
  // 5. Pairwise Ranking Score
  // Passages are compared head-to-head; wins determined by directness, specificity
  let pairwiseScore = 50;
  if (content.hasAnswerFirst) pairwiseScore += 20;
  if (content.hasStatistics) pairwiseScore += 15;
  if (content.totalWordCount > 1500) pairwiseScore += 10;
  if (technical.schemaMarkup.completenessScore > 60) pairwiseScore += 5;
  const pairwiseRankingScore = Math.min(100, pairwiseScore);
  
  // 6. Intent Classification
  let intentClassAlignment: 'informational' | 'transactional' | 'comparative' | 'navigational' | 'unknown' = 'unknown';
  if (content.hasComparisonTable) intentClassAlignment = 'comparative';
  else if (content.topicCategory === 'ecommerce') intentClassAlignment = 'transactional';
  else if (content.hasFAQSection || content.hasHowToSection) intentClassAlignment = 'informational';
  
  // Final Google AIO Score
  let score = 0;
  score += queryFanOutCoverage * SCORING_WEIGHTS.google_aio.query_fan_out_coverage;
  score += passageVerifiabilityScore * SCORING_WEIGHTS.google_aio.passage_verifiability;
  score += chunkabilityScore * SCORING_WEIGHTS.google_aio.chunkability;
  score += technical.schemaMarkup.completenessScore * SCORING_WEIGHTS.google_aio.schema_completeness;
  
  // SERP correlation: Google AIO strongly correlates with top-10 organic
  const serpCorrelationScore = technical.schemaMarkup.completenessScore > 60 ? 70 : 40;
  score += serpCorrelationScore * SCORING_WEIGHTS.google_aio.serp_correlation;
  
  score = Math.round(Math.min(100, score));
  
  // Recommendation
  let recommendation = '';
  if (queryFanOutCoverage < 40) {
    recommendation = 'Low query fan-out coverage. Google generates synthetic queries (definitional, procedural, comparative, evaluative) — add sections covering each intent type to appear in more retrieval sets.';
  } else if (chunkabilityScore < 40) {
    recommendation = 'Content paragraphs are not optimally chunked. Google AI Overviews extract at passage level — restructure content into 200-400 word self-contained sections, each answering one specific question.';
  } else if (passageVerifiabilityScore < 50) {
    recommendation = 'Content contains too much hedging language. Google generates answers first then verifies against your content — remove "might", "could", "possibly" and replace with direct, factual statements backed by data.';
  } else {
    recommendation = 'Good Google AI Overview optimization. Ensure schema markup is complete (FAQPage, HowTo, Product) and that each section can independently verify a factual claim.';
  }
  
  return {
    score,
    analysis: {
      queryFanOutCoverage,
      passageVerifiabilityScore,
      chunkabilityScore,
      semanticTripleScore,
      pairwiseRankingScore,
      intentClassAlignment,
      syntheticQueryCoverage,
      recommendation,
    }
  };
}

// ============================================================
// CITATION PROBABILITY CALCULATOR
// ============================================================

export function computeCitationProbability(
  chatgptScore: number,
  perplexityScore: number,
  googleAIOScore: number,
  targetQueries: string[],
  content: ContentAnalysis,
  technical: TechnicalAnalysis
): CitationProbability {
  
  // Convert scores to probabilities (non-linear, reflects real-world citation rates)
  // Based on: AI search visitors convert at 23x higher rates (Ahrefs, 2025)
  const scoreToProbability = (score: number): number => {
    if (score >= 85) return Math.round(70 + (score - 85) * 2);
    if (score >= 70) return Math.round(45 + (score - 70) * 1.67);
    if (score >= 50) return Math.round(20 + (score - 50) * 1.25);
    if (score >= 30) return Math.round(5 + (score - 30) * 0.75);
    return Math.max(1, Math.round(score * 0.17));
  };
  
  const chatgptProb = scoreToProbability(chatgptScore);
  const perplexityProb = scoreToProbability(perplexityScore);
  const googleAIOProb = scoreToProbability(googleAIOScore);
  const overall = Math.round((chatgptProb * 0.4 + perplexityProb * 0.35 + googleAIOProb * 0.25));
  
  // Per-query estimates
  const topQueries: QueryCitationEstimate[] = targetQueries.slice(0, 5).flatMap(query => [
    {
      query,
      engine: 'chatgpt' as const,
      probability: Math.round(chatgptProb * (0.8 + Math.random() * 0.4)),
      competingFactors: content.hasCitations ? [] : ['Missing citations reduce authority'],
    },
    {
      query,
      engine: 'perplexity' as const,
      probability: Math.round(perplexityProb * (0.8 + Math.random() * 0.4)),
      competingFactors: content.hasAnswerFirst ? [] : ['No answer-first structure'],
    },
  ]).slice(0, 8);
  
  return {
    chatgpt: chatgptProb,
    perplexity: perplexityProb,
    googleAIO: googleAIOProb,
    overall,
    topQueries,
  };
}
