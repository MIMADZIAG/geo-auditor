// ============================================================
// GEO-Auditor — Technical Analyzer Engine
// Analyzes robots.txt, schema markup, and technical signals
// ============================================================

import type { TechnicalAnalysis, SchemaAnalysis } from '../types/simulator';
import { AI_CRAWLERS, GOOGLE_AIO_PARAMS } from '../data/algorithmProfiles';

// Parse robots.txt to find blocked AI bots
export function analyzeRobotsTxt(robotsTxt: string): {
  allowedBots: string[];
  blockedBots: string[];
  status: TechnicalAnalysis['robotsTxtStatus'];
} {
  const allowedBots: string[] = [];
  const blockedBots: string[] = [];
  
  if (!robotsTxt || robotsTxt.trim() === '') {
    return { allowedBots: AI_CRAWLERS.map(c => c.name), blockedBots: [], status: 'allows_all' };
  }
  
  const lines = robotsTxt.split('\n').map(l => l.trim());
  let currentUserAgent: string[] = [];
  let isDisallowAll = false;
  
  for (const line of lines) {
    if (line.startsWith('#') || line === '') continue;
    
    if (line.toLowerCase().startsWith('user-agent:')) {
      currentUserAgent = [line.split(':')[1].trim()];
      isDisallowAll = false;
    } else if (line.toLowerCase().startsWith('disallow:')) {
      const path = line.split(':')[1]?.trim() || '';
      if (path === '/') {
        isDisallowAll = true;
        // Check which AI bots are blocked
        AI_CRAWLERS.forEach(crawler => {
          if (
            currentUserAgent.includes(crawler.name) ||
            currentUserAgent.includes('*')
          ) {
            if (!blockedBots.includes(crawler.name)) {
              blockedBots.push(crawler.name);
            }
          }
        });
      }
    } else if (line.toLowerCase().startsWith('allow:')) {
      const path = line.split(':')[1]?.trim() || '';
      if (path === '/') {
        AI_CRAWLERS.forEach(crawler => {
          if (currentUserAgent.includes(crawler.name)) {
            const idx = blockedBots.indexOf(crawler.name);
            if (idx > -1) blockedBots.splice(idx, 1);
            if (!allowedBots.includes(crawler.name)) {
              allowedBots.push(crawler.name);
            }
          }
        });
      }
    }
  }
  
  // Add all non-blocked bots to allowed
  AI_CRAWLERS.forEach(crawler => {
    if (!blockedBots.includes(crawler.name) && !allowedBots.includes(crawler.name)) {
      allowedBots.push(crawler.name);
    }
  });
  
  // Determine status
  let status: TechnicalAnalysis['robotsTxtStatus'] = 'allows_all';
  if (blockedBots.includes('GPTBot') || blockedBots.includes('OAI-SearchBot')) {
    status = 'blocks_gptbot';
  }
  if (blockedBots.includes('PerplexityBot')) {
    status = 'blocks_perplexitybot';
  }
  if (blockedBots.length >= AI_CRAWLERS.length * 0.7) {
    status = 'blocks_all_ai';
  }
  
  return { allowedBots, blockedBots, status };
}

// Analyze schema markup completeness
export function analyzeSchema(html: string): SchemaAnalysis {
  const types: string[] = [];
  
  // Extract all @type values
  const typeRegex = /"@type"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = typeRegex.exec(html)) !== null) {
    if (!types.includes(match[1])) types.push(match[1]);
  }
  
  const hasProduct = types.includes('Product');
  const hasArticle = types.includes('Article') || types.includes('BlogPosting') || types.includes('NewsArticle');
  const hasFAQPage = types.includes('FAQPage');
  const hasHowTo = types.includes('HowTo');
  const hasOrganization = types.includes('Organization');
  const hasPerson = types.includes('Person');
  const hasAggregateRating = types.includes('AggregateRating');
  const hasReview = types.includes('Review');
  const hasBreadcrumb = types.includes('BreadcrumbList');
  
  // Compute completeness score
  let completenessScore = 0;
  const tier1 = GOOGLE_AIO_PARAMS.schemaImpact.tier1_essential;
  const tier2 = GOOGLE_AIO_PARAMS.schemaImpact.tier2_high_value;
  
  const tier1Present = tier1.filter(t => types.includes(t)).length;
  const tier2Present = tier2.filter(t => types.includes(t)).length;
  
  completenessScore += (tier1Present / tier1.length) * 60;
  completenessScore += (tier2Present / tier2.length) * 40;
  
  // Missing recommended schemas
  const missingRecommended: string[] = [];
  if (!hasArticle && !hasProduct) missingRecommended.push('Article or Product');
  if (!hasFAQPage) missingRecommended.push('FAQPage');
  if (!hasHowTo) missingRecommended.push('HowTo');
  if (!hasOrganization) missingRecommended.push('Organization');
  if (!hasBreadcrumb) missingRecommended.push('BreadcrumbList');
  
  return {
    types,
    hasProduct,
    hasArticle,
    hasFAQPage,
    hasHowTo,
    hasOrganization,
    hasPerson,
    hasAggregateRating,
    hasReview,
    hasBreadcrumb,
    completenessScore: Math.round(completenessScore),
    missingRecommended,
  };
}

// Full technical analysis from HTML + robots.txt
export function analyzeTechnical(
  html: string,
  robotsTxt: string,
  url: string
): TechnicalAnalysis {
  const { allowedBots, blockedBots, status } = analyzeRobotsTxt(robotsTxt);
  const schemaMarkup = analyzeSchema(html);
  
  // Meta tags
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const titleTag = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null;
  
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1] : null;
  
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const ogTags = /<meta[^>]+property=["']og:/i.test(html);
  const mobileOptimized = /viewport/i.test(html);
  
  // IndexNow (important for Bing/Copilot)
  const hasIndexNow = html.includes('IndexNow') || url.includes('indexnow');
  
  // Estimated page speed (simplified heuristic)
  const scriptCount = (html.match(/<script/gi) || []).length;
  const imageCount = (html.match(/<img/gi) || []).length;
  const pageSpeedScore = Math.max(20, 100 - scriptCount * 2 - imageCount * 0.5);
  
  return {
    robotsTxtStatus: status,
    allowedBots,
    blockedBots,
    hasIndexNow,
    schemaMarkup,
    pageSpeedScore: Math.round(pageSpeedScore),
    mobileOptimized,
    hasCanonical,
    metaDescription,
    titleTag,
    ogTags,
  };
}
