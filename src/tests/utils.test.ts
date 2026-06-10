import { describe, it, expect } from "vitest";
import { slugify, formatDate, getStatusColor } from "@/lib/utils";

// ─── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("my org name")).toBe("my-org-name");
  });

  it("collapses multiple spaces/special chars into a single hyphen", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
    expect(slugify("  spaces  ")).toBe("spaces");
  });

  it("strips special characters", () => {
    expect(slugify("SculptOps v2.0!")).toBe("sculptops-v2-0");
  });

  it("handles numbers", () => {
    expect(slugify("Team 42")).toBe("team-42");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles all-special-char string", () => {
    expect(slugify("!!!")).toBe("");
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns 'Never' for null", () => {
    expect(formatDate(null)).toBe("Never");
  });

  it("returns a non-empty string for a valid Date", () => {
    const result = formatDate(new Date("2024-01-15T10:30:00Z"));
    expect(result).toBeTruthy();
    expect(result).not.toBe("Never");
  });

  it("returns a non-empty string for an ISO string", () => {
    const result = formatDate("2024-06-01T08:00:00Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("Never");
  });

  it("includes the year for a past date", () => {
    const result = formatDate(new Date("2020-03-15T00:00:00Z"));
    expect(result).toContain("2020");
  });
});

// ─── getStatusColor ───────────────────────────────────────────────────────────

describe("getStatusColor", () => {
  it("maps success → success", () => {
    expect(getStatusColor("success")).toBe("success");
  });

  it("maps failed → danger", () => {
    expect(getStatusColor("failed")).toBe("danger");
  });

  it("maps running → primary", () => {
    expect(getStatusColor("running")).toBe("primary");
  });

  it("maps pending → warning", () => {
    expect(getStatusColor("pending")).toBe("warning");
  });

  it("maps cancelled → default", () => {
    expect(getStatusColor("cancelled")).toBe("default");
  });

  it("maps unknown → default", () => {
    expect(getStatusColor("whatever")).toBe("default");
  });

  it("maps empty string → default", () => {
    expect(getStatusColor("")).toBe("default");
  });
});
