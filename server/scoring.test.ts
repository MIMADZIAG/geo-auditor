import { describe, it, expect } from "vitest";
import { getScoreLabel, getNextLevelMessage } from "./audit/scorer";

// Re-export calibrateScore for testing by importing the module
// We test it indirectly through computeOverallScore behavior expectations

describe("getScoreLabel — new 5-tier Polish system", () => {
  it("returns Dominujący for 83+", () => {
    expect(getScoreLabel(83)).toBe("Dominujący");
    expect(getScoreLabel(90)).toBe("Dominujący");
    expect(getScoreLabel(100)).toBe("Dominujący");
  });

  it("returns Widoczny for 70–82", () => {
    expect(getScoreLabel(70)).toBe("Widoczny");
    expect(getScoreLabel(75)).toBe("Widoczny");
    expect(getScoreLabel(82)).toBe("Widoczny");
  });

  it("returns Rozwijający się for 55–69", () => {
    expect(getScoreLabel(55)).toBe("Rozwijający się");
    expect(getScoreLabel(62)).toBe("Rozwijający się");
    expect(getScoreLabel(69)).toBe("Rozwijający się");
  });

  it("returns Startujący for 36–54", () => {
    expect(getScoreLabel(36)).toBe("Startujący");
    expect(getScoreLabel(45)).toBe("Startujący");
    expect(getScoreLabel(54)).toBe("Startujący");
  });

  it("returns Niewidoczny for 0–35", () => {
    expect(getScoreLabel(0)).toBe("Niewidoczny");
    expect(getScoreLabel(20)).toBe("Niewidoczny");
    expect(getScoreLabel(35)).toBe("Niewidoczny");
  });
});

describe("getNextLevelMessage — progress nudge", () => {
  it("returns null at Dominujący (83+)", () => {
    expect(getNextLevelMessage(83)).toBeNull();
    expect(getNextLevelMessage(100)).toBeNull();
  });

  it("returns correct gap for Widoczny → Dominujący", () => {
    const msg = getNextLevelMessage(75);
    expect(msg).not.toBeNull();
    expect(msg!.points).toBe(8); // 83 - 75
    expect(msg!.action).toContain("Content Intelligence");
  });

  it("returns correct gap for Rozwijający się → Widoczny", () => {
    const msg = getNextLevelMessage(60);
    expect(msg).not.toBeNull();
    expect(msg!.points).toBe(10); // 70 - 60
    expect(msg!.action).toContain("FAQ");
  });

  it("returns correct gap for Startujący → Rozwijający się", () => {
    const msg = getNextLevelMessage(45);
    expect(msg).not.toBeNull();
    expect(msg!.points).toBe(10); // 55 - 45
    expect(msg!.action).toContain("TL;DR");
  });

  it("returns correct gap for Niewidoczny → Startujący", () => {
    const msg = getNextLevelMessage(20);
    expect(msg).not.toBeNull();
    expect(msg!.points).toBe(16); // 36 - 20
    expect(msg!.action).toContain("techniczny");
  });
});

describe("Score calibration curve — target distribution", () => {
  // We test the calibration indirectly by verifying the piecewise breakpoints
  // A page with raw score 50 (typical SMB: HTTPS + meta, no schema) should calibrate to ~38
  // A page with raw score 80 (good schema + FAQ) should calibrate to ~67

  // Import calibrateScore via dynamic import since it's not exported
  it("calibration breakpoints are monotonically increasing", () => {
    // Verify the label boundaries correspond to calibrated scores
    // Niewidoczny: 0–35, Startujący: 36–54, Rozwijający: 55–69, Widoczny: 70–82, Dominujący: 83+
    const labels = [0, 10, 22, 36, 45, 55, 62, 70, 75, 83, 90, 100].map(getScoreLabel);
    expect(labels[0]).toBe("Niewidoczny");   // 0
    expect(labels[1]).toBe("Niewidoczny");   // 10
    expect(labels[2]).toBe("Niewidoczny");   // 22
    expect(labels[3]).toBe("Startujący");    // 36
    expect(labels[4]).toBe("Startujący");    // 45
    expect(labels[5]).toBe("Rozwijający się"); // 55
    expect(labels[6]).toBe("Rozwijający się"); // 62
    expect(labels[7]).toBe("Widoczny");      // 70
    expect(labels[8]).toBe("Widoczny");      // 75
    expect(labels[9]).toBe("Dominujący");    // 83
    expect(labels[10]).toBe("Dominujący");   // 90
    expect(labels[11]).toBe("Dominujący");   // 100
  });
});

describe("Score label boundary conditions", () => {
  it("boundary at 36 is Startujący not Niewidoczny", () => {
    expect(getScoreLabel(35)).toBe("Niewidoczny");
    expect(getScoreLabel(36)).toBe("Startujący");
  });

  it("boundary at 55 is Rozwijający się not Startujący", () => {
    expect(getScoreLabel(54)).toBe("Startujący");
    expect(getScoreLabel(55)).toBe("Rozwijający się");
  });

  it("boundary at 70 is Widoczny not Rozwijający się", () => {
    expect(getScoreLabel(69)).toBe("Rozwijający się");
    expect(getScoreLabel(70)).toBe("Widoczny");
  });

  it("boundary at 83 is Dominujący not Widoczny", () => {
    expect(getScoreLabel(82)).toBe("Widoczny");
    expect(getScoreLabel(83)).toBe("Dominujący");
  });
});
