import { describe, it, expect } from "vitest";
import { formatBytes, formatDate, cn } from "./utils";

describe("formatBytes", () => {
  it("0 byte için 0 B döner", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
  it("1024 için 1 KB döner", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });
  it("1536 için 1.5 KB döner", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
  it("1048576 için 1 MB döner", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });
});

describe("formatDate", () => {
  it("geçerli tarih string için Türkçe format döner", () => {
    const s = formatDate("2025-03-15T12:30:00Z");
    expect(s).toMatch(/\d{2}/);
    expect(s.length).toBeGreaterThan(5);
  });
});

describe("cn", () => {
  it("sınıfları birleştirir", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("tailwind çakışmalarında merge eder", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
