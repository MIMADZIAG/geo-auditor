/**
 * GEO-Auditor PDF Report Generator
 *
 * Generates a branded PDF report for audit results using PDFKit.
 * Returns a Buffer that can be sent as a file download.
 */

import PDFDocument from "pdfkit";

// ─── Color Palette ─────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0a0f",
  bgCard: "#12121a",
  primary: "#7c3aed",
  primaryLight: "#a78bfa",
  accent: "#06b6d4",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  border: "#1e1e2e",
  white: "#ffffff",
};

// ─── Score Color ───────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.warning;
  return COLORS.danger;
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Good";
  if (score >= 60) return "Needs Work";
  return "Critical";
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface AuditReportData {
  url: string;
  pageTitle?: string;
  overallScore: number;
  technicalScore?: number;
  structuredDataScore?: number;
  contentStructureScore?: number;
  eeatScore?: number;
  aiCrawlerScore?: number;
  metaTagsScore?: number;
  contentIntelligenceScore?: number;
  citeabilityScore?: number;
  findings: Array<{
    id: string;
    title: string;
    severity: "critical" | "high" | "medium" | "low" | "info" | "ok";
    description?: string;
    recommendation?: string;
  }>;
  recommendations?: string[];
  llmAiInsight?: string;
  llmTopPriority?: string;
  createdAt: Date;
}

// ─── Main Generator ────────────────────────────────────────────────────────────

export function generateAuditPDF(data: AuditReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `GEO-Auditor Report — ${data.url}`,
        Author: "GEO-Auditor",
        Subject: "AI Search Visibility Audit",
        Keywords: "GEO, SEO, AI Search, Audit",
        CreationDate: new Date(),
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    // ─── Page 1: Cover ──────────────────────────────────────────────────────────

    // Dark background
    doc.rect(0, 0, pageWidth, pageHeight).fill("#0a0a0f");

    // Gradient header band
    doc.rect(0, 0, pageWidth, 220).fill("#12121a");

    // Accent bar
    doc.rect(0, 0, pageWidth, 4).fill(COLORS.primary);

    // Logo / Brand
    doc.fontSize(22).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("GEO-Auditor", margin, 30, { continued: false });

    doc.fontSize(10).font("Helvetica").fillColor(COLORS.textSecondary)
      .text("AI Search Visibility Report", margin, 56);

    // Report date
    const dateStr = data.createdAt.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
    doc.fontSize(9).fillColor(COLORS.textSecondary)
      .text(`Generated: ${dateStr}`, pageWidth - margin - 160, 56, { width: 160, align: "right" });

    // URL
    doc.fontSize(11).font("Helvetica").fillColor(COLORS.primaryLight)
      .text(data.url, margin, 80, { width: contentWidth, ellipsis: true });

    if (data.pageTitle) {
      doc.fontSize(14).font("Helvetica-Bold").fillColor(COLORS.white)
        .text(data.pageTitle, margin, 100, { width: contentWidth });
    }

    // Overall Score — big circle
    const scoreX = pageWidth - margin - 80;
    const scoreY = 100;
    const radius = 50;

    // Circle background
    doc.circle(scoreX, scoreY, radius).fill("#1a1a2e");
    // Score arc (simplified as colored circle border)
    doc.circle(scoreX, scoreY, radius).lineWidth(6).strokeColor(scoreColor(data.overallScore)).stroke();

    // Score number
    doc.fontSize(28).font("Helvetica-Bold").fillColor(scoreColor(data.overallScore))
      .text(Math.round(data.overallScore).toString(), scoreX - 22, scoreY - 18, { width: 44, align: "center" });

    doc.fontSize(8).font("Helvetica").fillColor(COLORS.textSecondary)
      .text("/ 100", scoreX - 22, scoreY + 12, { width: 44, align: "center" });

    doc.fontSize(9).fillColor(scoreColor(data.overallScore))
      .text(scoreLabel(data.overallScore), scoreX - 30, scoreY + 32, { width: 60, align: "center" });

    // Score label
    doc.fontSize(10).font("Helvetica").fillColor(COLORS.textSecondary)
      .text("AI-Readiness Score", scoreX - 40, scoreY + 50, { width: 80, align: "center" });

    // ─── Score Breakdown ────────────────────────────────────────────────────────
    const breakdownY = 180;
    doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("Score Breakdown", margin, breakdownY);

    const modules = [
      { label: "Technical SEO", score: data.technicalScore },
      { label: "Structured Data", score: data.structuredDataScore },
      { label: "Content Structure", score: data.contentStructureScore },
      { label: "E-E-A-T Signals", score: data.eeatScore },
      { label: "AI Crawlers", score: data.aiCrawlerScore },
      { label: "Meta Tags", score: data.metaTagsScore },
      { label: "Content Intelligence", score: data.contentIntelligenceScore },
      { label: "Citeability", score: data.citeabilityScore },
    ].filter((m) => m.score !== undefined && m.score !== null);

    const colWidth = (contentWidth - 10) / 2;
    let colX = margin;
    let colY = breakdownY + 22;

    modules.forEach((mod, i) => {
      if (i === Math.ceil(modules.length / 2)) {
        colX = margin + colWidth + 10;
        colY = breakdownY + 22;
      }

      const score = Math.round(mod.score ?? 0);
      const barWidth = colWidth - 80;
      const fillWidth = (score / 100) * barWidth;

      // Label
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.textSecondary)
        .text(mod.label, colX, colY, { width: 100 });

      // Bar background
      doc.rect(colX + 105, colY + 2, barWidth, 7).fill("#1e1e2e");
      // Bar fill
      if (fillWidth > 0) {
        doc.rect(colX + 105, colY + 2, fillWidth, 7).fill(scoreColor(score));
      }

      // Score number
      doc.fontSize(9).font("Helvetica-Bold").fillColor(scoreColor(score))
        .text(`${score}`, colX + 105 + barWidth + 5, colY, { width: 25, align: "right" });

      colY += 18;
    });

    // ─── Page 2: Findings ───────────────────────────────────────────────────────
    doc.addPage({ size: "A4", margin: 0 });
    doc.rect(0, 0, pageWidth, pageHeight).fill("#0a0a0f");
    doc.rect(0, 0, pageWidth, 4).fill(COLORS.primary);

    // Page header
    doc.fontSize(16).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("Findings & Recommendations", margin, 24);
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.textSecondary)
      .text(data.url, margin, 44, { width: contentWidth, ellipsis: true });

    let y = 70;

    // AI Insight (if available)
    if (data.llmAiInsight) {
      doc.rect(margin, y, contentWidth, 1).fill(COLORS.border);
      y += 10;

      doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.primaryLight)
        .text("AI Insight", margin, y);
      y += 18;

      const insightText = data.llmAiInsight.slice(0, 400);
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.textSecondary)
        .text(insightText, margin, y, { width: contentWidth, lineGap: 3 });
      y += doc.heightOfString(insightText, { width: contentWidth, lineGap: 3 }) + 16;
    }

    // Top Priority
    if (data.llmTopPriority) {
      doc.rect(margin, y, contentWidth, 40).fill("#1a1a2e");
      doc.rect(margin, y, 3, 40).fill(COLORS.warning);

      doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.warning)
        .text("TOP PRIORITY", margin + 12, y + 8);
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.white)
        .text(data.llmTopPriority.slice(0, 200), margin + 12, y + 22, { width: contentWidth - 20 });
      y += 52;
    }

    // Findings list
    const criticalFindings = data.findings.filter((f) => f.severity === "critical");
    const highFindings = data.findings.filter((f) => f.severity === "high");
    const otherFindings = data.findings.filter((f) => !["critical", "high", "ok"].includes(f.severity));
    const okFindings = data.findings.filter((f) => f.severity === "ok");

    const severityGroups = [
      { label: "Critical Issues", findings: criticalFindings, color: COLORS.danger },
      { label: "High Priority", findings: highFindings, color: COLORS.warning },
      { label: "Other Issues", findings: otherFindings, color: COLORS.accent },
      { label: "Passing Checks", findings: okFindings.slice(0, 5), color: COLORS.success },
    ];

    for (const group of severityGroups) {
      if (group.findings.length === 0) continue;

      // Check if we need a new page
      if (y > pageHeight - 100) {
        doc.addPage({ size: "A4", margin: 0 });
        doc.rect(0, 0, pageWidth, pageHeight).fill("#0a0a0f");
        doc.rect(0, 0, pageWidth, 4).fill(COLORS.primary);
        y = 30;
      }

      doc.fontSize(11).font("Helvetica-Bold").fillColor(group.color)
        .text(`${group.label} (${group.findings.length})`, margin, y);
      y += 18;

      for (const finding of group.findings.slice(0, 10)) {
        if (y > pageHeight - 80) {
          doc.addPage({ size: "A4", margin: 0 });
          doc.rect(0, 0, pageWidth, pageHeight).fill("#0a0a0f");
          doc.rect(0, 0, pageWidth, 4).fill(COLORS.primary);
          y = 30;
        }

        // Finding card
        const cardHeight = finding.recommendation ? 52 : 36;
        doc.rect(margin, y, contentWidth, cardHeight).fill("#12121a");
        doc.rect(margin, y, 3, cardHeight).fill(group.color);

        doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.white)
          .text(finding.title, margin + 10, y + 8, { width: contentWidth - 20 });

        if (finding.recommendation) {
          doc.fontSize(8).font("Helvetica").fillColor(COLORS.textSecondary)
            .text(`Fix: ${finding.recommendation.slice(0, 150)}`, margin + 10, y + 24, { width: contentWidth - 20 });
        }

        y += cardHeight + 4;
      }

      y += 8;
    }

    // ─── Footer on last page ────────────────────────────────────────────────────
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.textSecondary)
      .text(
        `GEO-Auditor · geoauditor-2tppvwaq.manus.space · Generated ${dateStr}`,
        margin,
        pageHeight - 20,
        { width: contentWidth, align: "center" }
      );

    doc.end();
  });
}
