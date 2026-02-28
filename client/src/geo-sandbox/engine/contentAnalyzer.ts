// ============================================================
// GEO-Auditor — Content Analyzer Engine
// Analyzes raw HTML/text content for AI citation readiness
// ============================================================

import type { ContentAnalysis, ContentChunk, HeadingNode } from '../types/simulator';
import { TOPIC_KEYWORDS } from '../data/algorithmProfiles';

// Detect topic category from content
function detectTopicCategory(text: string): string {
  const lowerText = text.toLowerCase();
  
  let highCount = 0;
  let ecommerceCount = 0;
  let restrictedCount = 0;
  
  TOPIC_KEYWORDS.high_multiplier.forEach(kw => {
    if (lowerText.includes(kw)) highCount++;
  });
  TOPIC_KEYWORDS.ecommerce.forEach(kw => {
    if (lowerText.includes(kw)) ecommerceCount++;
  });
  TOPIC_KEYWORDS.restricted.forEach(kw => {
    if (lowerText.includes(kw)) restrictedCount++;
  });
  
  if (restrictedCount > highCount && restrictedCount > ecommerceCount) return 'entertainment';
  if (highCount >= 3) return 'technology';
  if (ecommerceCount >= 3) return 'ecommerce';
  return 'general';
}

// Extract headings from HTML
function extractHeadings(html: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const isQueryLike = /^(what|how|why|when|where|which|who|is|are|can|does|do|best|top)/i.test(text) ||
                        text.includes('?');
    headings.push({ level, text, isQueryLike });
  }
  
  return headings;
}

// Extract schema types from JSON-LD
function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  const schemaRegex = /"@type"\s*:\s*"([^"]+)"/g;
  let match;
  
  while ((match = schemaRegex.exec(html)) !== null) {
    if (!types.includes(match[1])) {
      types.push(match[1]);
    }
  }
  
  return types;
}

// Approximate Flesch-Kincaid readability
function approximateReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((acc, word) => {
    // Simple syllable approximation
    const vowelGroups = word.toLowerCase().match(/[aeiouy]+/g);
    return acc + (vowelGroups ? vowelGroups.length : 1);
  }, 0);
  
  if (sentences.length === 0 || words.length === 0) return 50;
  
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  
  // Flesch Reading Ease formula
  const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Split content into semantic chunks
function createChunks(text: string, headings: HeadingNode[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  
  // Split by paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  
  paragraphs.forEach((para, index) => {
    const words = para.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    if (wordCount < 20) return; // Skip very short fragments
    
    const hasNumbers = /\d+/.test(para);
    const hasCitations = /\[\d+\]|\(source|according to|study shows|research|data shows/i.test(para);
    const hasDirectAnswer = /^(the |a |an |yes|no|[A-Z][\w\s]+ is |[A-Z][\w\s]+ are )/i.test(para.trim());
    
    // Find nearest heading context
    const headingContext = headings.length > 0 
      ? headings[Math.min(Math.floor(index / 3), headings.length - 1)]?.text || ''
      : '';
    
    // Chunkability: 200-400 words is optimal for RAG [Google Patent, NVIDIA benchmark]
    const optimalSize = wordCount >= 200 && wordCount <= 400;
    const isSelfContained = hasDirectAnswer && wordCount >= 100;
    
    let chunkabilityScore = 50;
    if (optimalSize) chunkabilityScore += 20;
    if (isSelfContained) chunkabilityScore += 15;
    if (hasNumbers) chunkabilityScore += 10;
    if (hasCitations) chunkabilityScore += 5;
    if (wordCount > 600) chunkabilityScore -= 20; // too long, hard to chunk
    if (wordCount < 100) chunkabilityScore -= 15; // too short
    
    chunks.push({
      id: `chunk_${index}`,
      text: para.trim(),
      wordCount,
      isSelfContained,
      hasDirectAnswer,
      hasNumbers,
      hasCitations,
      headingContext,
      chunkabilityScore: Math.max(0, Math.min(100, chunkabilityScore)),
    });
  });
  
  return chunks;
}

// Check for content freshness signals
function detectFreshness(html: string, text: string): 'fresh' | 'recent' | 'stale' | 'unknown' {
  const currentYear = new Date().getFullYear();
  
  // Look for date patterns
  const datePatterns = [
    /(\d{4})-(\d{2})-(\d{2})/,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+(\d{4})/i,
    /updated?\s+(in\s+)?(\d{4})/i,
    /published?\s+(in\s+)?(\d{4})/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const yearStr = match[0].match(/\d{4}/);
      if (yearStr) {
        const year = parseInt(yearStr[0]);
        const age = currentYear - year;
        if (age <= 1) return 'fresh';
        if (age <= 2) return 'recent';
        return 'stale';
      }
    }
  }
  
  // Check meta tags
  if (html.includes('datePublished') || html.includes('dateModified')) {
    return 'recent'; // Has date signals but couldn't parse
  }
  
  return 'unknown';
}

// Main content analysis function
export function analyzeContent(html: string): ContentAnalysis {
  // Strip HTML tags for text analysis
  const rawText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const headings = extractHeadings(html);
  const schemaTypes = extractSchemaTypes(html);
  const chunks = createChunks(rawText, headings);
  const totalWordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
  const avgChunkWordCount = chunks.length > 0 
    ? Math.round(chunks.reduce((acc, c) => acc + c.wordCount, 0) / chunks.length)
    : 0;
  
  // Answer-First principle: first meaningful paragraph answers query directly
  const firstParagraph = chunks[0]?.text || '';
  const hasAnswerFirst = firstParagraph.length > 0 && (
    /^(the |a |an |yes,|no,|[A-Z][\w\s]+ is |[A-Z][\w\s]+ are )/i.test(firstParagraph) ||
    firstParagraph.split(/\s+/).length <= 80 // ≤80 tokens as per Perplexity requirement
  );
  
  // Statistics detection
  const hasStatistics = /\d+%|\d+\s*(million|billion|thousand|hundred)|\$\d+|\d+\s*times|\d+x\s/i.test(rawText);
  
  // Citations detection  
  const hasCitations = /\[\d+\]|according to|study (shows|found|reveals)|research (shows|found|reveals)|source:|via |cited by/i.test(rawText);
  
  // Comparison table
  const hasComparisonTable = /<table/i.test(html) && (
    /compare|vs\.|versus|comparison/i.test(rawText)
  );
  
  // FAQ section
  const hasFAQSection = /faq|frequently asked|common questions/i.test(rawText) ||
    schemaTypes.includes('FAQPage') ||
    headings.some(h => /faq|frequently asked|common questions/i.test(h.text));
  
  // HowTo section
  const hasHowToSection = /how to|step \d|step-by-step/i.test(rawText) ||
    schemaTypes.includes('HowTo') ||
    headings.some(h => /how to|step \d/i.test(h.text));
  
  // Entity mentions (simplified - looks for capitalized proper nouns)
  const entityMatches = rawText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const entityMentions = Array.from(new Set(entityMatches)).slice(0, 20);
  
  const topicCategory = detectTopicCategory(rawText);
  const contentFreshness = detectFreshness(html, rawText);
  const readabilityScore = approximateReadability(rawText);
  
  return {
    rawText,
    chunks,
    totalWordCount,
    avgChunkWordCount,
    hasAnswerFirst,
    headingStructure: headings,
    schemaTypes,
    hasStatistics,
    hasCitations,
    hasComparisonTable,
    hasFAQSection,
    hasHowToSection,
    entityMentions,
    topicCategory,
    contentFreshness,
    readabilityScore,
  };
}
