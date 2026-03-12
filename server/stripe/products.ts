/**
 * GEO-Auditor Stripe Products Configuration
 *
 * Plans:
 *   - Starter ($39/month): 50 audits, history, monitoring 10 pages, PDF export
 *   - Pro ($99/month): 200 audits, monitoring 50 pages, competitor analysis, advanced recommendations
 *   - Business ($299/month): unlimited audits, white-label reports, API, integrations
 */

export type PlanId = "starter" | "pro" | "business";

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number; // in USD cents
  priceDisplay: string;
  description: string;
  features: string[];
  limits: {
    auditsPerMonth: number;
    monitoredPages: number;
    citationChecks: boolean;
    aiCopilot: boolean;
    pdfExport: boolean;
    competitorAnalysis: boolean;
    whiteLabel: boolean;
    apiAccess: boolean;
  };
  // Stripe Price IDs — set after creating products in Stripe Dashboard
  // For now using lookup keys that will be created via Stripe CLI or Dashboard
  stripePriceId: string | null;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 3900, // $39/month
    priceDisplay: "$39/month",
    description: "For individual content creators and small businesses",
    features: [
      "50 audits per month",
      "Full AI-Readiness scoring",
      "AI Citation Check (ChatGPT + Google AI Overviews)",
      "AI Content Co-Pilot",
      "Monitor 10 pages",
      "Audit history",
      "PDF export",
    ],
    limits: {
      auditsPerMonth: 50,
      monitoredPages: 10,
      citationChecks: true,
      aiCopilot: true,
      pdfExport: true,
      competitorAnalysis: false,
      whiteLabel: false,
      apiAccess: false,
    },
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? null,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 9900, // $99/month
    priceDisplay: "$99/month",
    description: "For SEO professionals and growing e-commerce stores",
    features: [
      "200 audits per month",
      "Everything in Starter",
      "Monitor 50 pages",
      "Competitor domain analysis",
      "Advanced content recommendations",
      "Priority support",
    ],
    limits: {
      auditsPerMonth: 200,
      monitoredPages: 50,
      citationChecks: true,
      aiCopilot: true,
      pdfExport: true,
      competitorAnalysis: true,
      whiteLabel: false,
      apiAccess: false,
    },
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
  },
  business: {
    id: "business",
    name: "Business",
    price: 29900, // $299/month
    priceDisplay: "$299/month",
    description: "For agencies and enterprise teams",
    features: [
      "Unlimited audits",
      "Everything in Pro",
      "Monitor unlimited pages",
      "White-label PDF reports",
      "API access",
      "Shopify / WooCommerce integrations",
      "Dedicated support",
    ],
    limits: {
      auditsPerMonth: Infinity,
      monitoredPages: Infinity,
      citationChecks: true,
      aiCopilot: true,
      pdfExport: true,
      competitorAnalysis: true,
      whiteLabel: true,
      apiAccess: true,
    },
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS ?? null,
  },
};

export const FREE_PLAN_LIMITS = {
  auditsPerMonth: 5,
  monitoredPages: 1,
  citationChecks: false,
  aiCopilot: false,
  pdfExport: false,
  competitorAnalysis: false,
  whiteLabel: false,
  apiAccess: false,
};

export function getPlanLimits(plan: string) {
  if (plan === "free") return FREE_PLAN_LIMITS;
  return PLANS[plan as PlanId]?.limits ?? FREE_PLAN_LIMITS;
}
