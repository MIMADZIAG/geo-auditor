// ============================================================
// GEO-Auditor — Algorithm Profiles Database
// Sources:
// [1] Yesilyurt, M. (2025). ChatGPT RRF Discovery. metehan.ai
// [2] Yesilyurt, M. (2026). Perplexity 59 Ranking Patterns. metehan.ai
// [3] King, M. (2025). How AI Mode and AI Overviews Work Based on Patents. SEL
// [4] Digital Bloom (2025). 2025 AI Citation & LLM Visibility Report
// [5] Discovered Labs (2025). How ChatGPT uses RRF for AI citations
// ============================================================

// --- CHATGPT RRF PARAMETERS ---
// Discovered in ChatGPT's Chrome DevTools source [1]
export const CHATGPT_RRF_PARAMS = {
  rrf_alpha: 1,
  rrf_input_threshold: 0,
  ranking_model: null,
  k_constant: 60, // standard RRF k=60
  
  // Formula: score = 1 / (k + rank_position)
  // Rank #1 = 1/(60+1) = 0.0164
  // Rank #5 = 1/(60+5) = 0.0154
  // Rank #10 = 1/(60+10) = 0.0143
  
  // Multi-source integration types discovered in code [1]
  result_types: ['webpage', 'webpage_extended', 'grouped_webpages', 'image_inline'],
  
  // Preferred citation sources (from 1B citation analysis [5])
  preferredSources: {
    tier1: ['wikipedia.org', 'reddit.com'],
    tier2: ['github.com', 'stackoverflow.com', 'medium.com'],
    tier3: ['industry_publications', 'news_sites'],
  },
  
  // Content signals that improve RRF performance [4][5]
  positiveSignals: {
    statisticsPresent: 0.22,      // +22% visibility boost [4]
    citationsPresent: 0.37,       // +37% visibility boost [4]
    quotationsPresent: 0.37,      // +37% visibility boost [4]
    comparativeListicle: 0.325,   // 32.5% of all AI citations [4]
    wordCount_10000plus: 0.187,   // 187 citations for 10k+ word articles [4]
    fleschScore_55plus: 0.15,     // readability matters for ChatGPT [4]
    answerFirst: 0.20,            // content leads with direct answer
    topicCluster: 2.8,            // 2.8x more likely when on 4+ platforms [4]
  },
  
  // Content position bias [SearchEngineLand, Feb 2026]
  positionBias: {
    first_third: 0.44,  // 44% of citations from first third of content
    mid_third: 0.33,
    last_third: 0.23,
  }
};

// --- PERPLEXITY RANKING PARAMETERS ---
// Discovered through browser infrastructure analysis [2]
export const PERPLEXITY_PARAMS = {
  // L3 XGBoost Reranker parameters
  l3_reranker: {
    enabled: true,
    model: 'l3_xgb_model',
    drop_threshold: 0.35,  // estimated quality threshold
    drop_all_if_count_less_equal: 2,
    
    // Content must pass these quality gates to avoid being dropped:
    qualityGates: {
      answer_first_max_tokens: 80,    // direct answer in ≤80 tokens
      requires_because_line: true,    // "Because: [reason with number]"
      entity_disambiguation: true,    // entities must be clearly defined
      minimum_numerical_density: 0.02, // at least 2% numerical content
    }
  },
  
  // Manually curated authoritative domains [2]
  authorityDomains: {
    ecommerce: ['amazon.com', 'ebay.com', 'walmart.com', 'bestbuy.com', 'etsy.com', 'target.com'],
    tech: ['github.com', 'stackoverflow.com', 'notion.so', 'slack.com', 'figma.com'],
    social: ['reddit.com', 'linkedin.com', 'twitter.com', 'discord.com'],
    education: ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org'],
    travel: ['booking.com', 'airbnb.com', 'expedia.com', 'kayak.com'],
    reference: ['wikipedia.org', 'britannica.com', 'scholar.google.com'],
    news: ['reuters.com', 'bbc.com', 'nytimes.com', 'techcrunch.com'],
  },
  
  // Topic multipliers [2]
  topicMultipliers: {
    high: {
      categories: ['artificial_intelligence', 'technology', 'science', 'business', 'finance', 'health'],
      multiplier: 2.5,
    },
    medium: {
      categories: ['education', 'travel', 'food', 'lifestyle', 'ecommerce'],
      multiplier: 1.5,
    },
    default: {
      categories: ['general'],
      multiplier: 1.0,
    },
    restricted: {
      categories: ['entertainment', 'sports', 'celebrity'],
      multiplier: 0.3,
    }
  },
  
  // New post system [2]
  newPostSystem: {
    impression_threshold: 100,    // minimum impressions in launch window
    time_threshold_minutes: 30,   // critical engagement window
    ctr_requirement: 0.05,        // 5% CTR minimum for amplification
  },
  
  // Time decay [2]
  timeDecay: {
    rate: 'exponential',
    half_life_days: 30,           // visibility halves every ~30 days
    refresh_bonus: 0.3,           // 30% boost for updated content
  },
  
  // Embedding similarity threshold [2]
  embedding: {
    similarity_threshold: 0.72,   // minimum cosine similarity
    text_embedding_model: 'text_embedding_v1',
  },
  
  // Engagement tracking [2]
  engagement: {
    discover_engagement_7d: true,
    historic_engagement_v1: true,
    no_click_penalty: -0.15,      // penalty for content users avoid
  },
  
  // Content structure requirements [2]
  contentStructure: {
    definition_block: true,       // "What is X" block required
    steps_block: true,            // "How to" steps block
    comparison_block: true,       // "X vs Y" comparison
    optimal_answer_tokens: 80,    // direct answer length
  }
};

// --- GOOGLE AI OVERVIEWS PARAMETERS ---
// Based on 6 Google patents analyzed by Michael King [3]
export const GOOGLE_AIO_PARAMS = {
  // Query fan-out (Patent: Systems and methods for prompt-based query generation)
  queryFanOut: {
    enabled: true,
    syntheticQueryTypes: [
      'explicit',      // the actual query
      'related',       // semantically related queries
      'recent',        // recent queries from same user session
      'implied',       // inferred intent queries
      'comparative',   // "X vs Y" variants
      'definitional',  // "What is X" variants
    ],
    // Content must cover multiple synthetic query variants to be retrieved
    minQueryCoverageForRetrieval: 3,
  },
  
  // Generate-first process (Patent: Generative summaries for search results)
  generateFirst: {
    // Google generates answer FIRST, then verifies against content
    // Your content must be able to VERIFY a pre-generated claim
    verificationMode: 'passage_level', // not page-level
    semanticAlignmentRequired: true,
    hedgingPenalty: true,   // vague/salesy content fails verification
    factualAnchorRequired: true,
  },
  
  // Pairwise passage ranking (Patent: Method for Text Ranking with Pairwise Ranking Prompting)
  pairwiseRanking: {
    enabled: true,
    // Passages are compared head-to-head by an LLM
    // Wins are determined by: clarity, specificity, factual support
    winFactors: ['directness', 'specificity', 'factual_density', 'entity_clarity'],
  },
  
  // Passage-level chunkability requirements
  chunkability: {
    optimal_word_count: { min: 200, max: 400 },
    must_be_self_contained: true,
    must_answer_one_question: true,
    must_have_entity_context: true,
  },
  
  // Schema markup impact (Search Engine Land experiment)
  schemaImpact: {
    well_implemented: { rank_improvement: 5, aio_appearance: true },
    poorly_implemented: { rank_improvement: -2, aio_appearance: false },
    no_schema: { rank_improvement: -10, aio_appearance: false, indexed: false },
    
    // Priority schema types for AI visibility [4]
    tier1_essential: ['HowTo', 'Article', 'BlogPosting', 'Organization', 'Person'],
    tier2_high_value: ['Product', 'Offer', 'LocalBusiness', 'Review', 'AggregateRating', 'FAQPage'],
    
    // Comparison tables with proper HTML: +47% citation rate [4]
    comparison_table_boost: 0.47,
  },
  
  // Citation position bias
  citationPatterns: {
    // 93.67% of citations link to at least one top-10 organic result [4]
    top10_correlation: 0.9367,
    // Only 4.5% directly match Page 1 URL - deeper pages on authority domains win
    deep_page_preference: true,
    // 10.2 average links from 4 unique domains per response
    avg_citations_per_response: 10.2,
    avg_domains_per_response: 4,
  },
  
  // Content signals
  contentSignals: {
    // 65% of AI bot hits target content published within past year [4]
    freshness_1year_weight: 0.65,
    freshness_2year_weight: 0.79,
    // Google Page 1 rankings correlate ~0.65 with LLM mentions [4]
    serp_correlation: 0.65,
  }
};

// --- UNIVERSAL SCORING WEIGHTS ---
export const SCORING_WEIGHTS = {
  chatgpt: {
    rrf_topical_coverage: 0.30,
    content_structure: 0.25,
    technical_access: 0.20,
    authority_signals: 0.15,
    freshness: 0.10,
  },
  perplexity: {
    l3_quality_gate: 0.35,
    answer_first_structure: 0.25,
    topic_multiplier: 0.20,
    authority_proximity: 0.10,
    freshness: 0.10,
  },
  google_aio: {
    query_fan_out_coverage: 0.30,
    passage_verifiability: 0.25,
    chunkability: 0.20,
    schema_completeness: 0.15,
    serp_correlation: 0.10,
  }
};

// --- AI BOT CRAWLERS ---
// For robots.txt analysis
export const AI_CRAWLERS = [
  { name: 'GPTBot', owner: 'OpenAI', purpose: 'training', engine: 'chatgpt' },
  { name: 'OAI-SearchBot', owner: 'OpenAI', purpose: 'search', engine: 'chatgpt' },
  { name: 'PerplexityBot', owner: 'Perplexity', purpose: 'search', engine: 'perplexity' },
  { name: 'Google-Extended', owner: 'Google', purpose: 'training', engine: 'google_aio' },
  { name: 'Googlebot', owner: 'Google', purpose: 'search', engine: 'google_aio' },
  { name: 'ClaudeBot', owner: 'Anthropic', purpose: 'training', engine: 'claude' },
  { name: 'Applebot-Extended', owner: 'Apple', purpose: 'training', engine: 'apple' },
  { name: 'Bingbot', owner: 'Microsoft', purpose: 'search', engine: 'copilot' },
];

// --- TOPIC CLASSIFICATION ---
export const TOPIC_KEYWORDS = {
  high_multiplier: [
    'ai', 'artificial intelligence', 'machine learning', 'technology', 'software', 'saas',
    'science', 'research', 'finance', 'investment', 'startup', 'business', 'analytics',
    'health', 'medical', 'cybersecurity', 'blockchain', 'data'
  ],
  ecommerce: [
    'buy', 'shop', 'price', 'product', 'review', 'best', 'top', 'compare', 'deal',
    'discount', 'sale', 'order', 'shipping', 'store', 'brand', 'quality'
  ],
  restricted: [
    'celebrity', 'gossip', 'entertainment', 'sports', 'game', 'movie', 'music', 'tv show',
    'actor', 'singer', 'player', 'team', 'match', 'score'
  ]
};
