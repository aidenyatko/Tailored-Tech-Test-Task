import { describe, expect, it } from "vitest";
import { DataRoomError } from "./errors";
import { createUniqueName, ensureUniqueName, normalizeName } from "./name";

describe("name helpers", () => {
  it("normalizes surrounding and repeated whitespace", () => {
    expect(normalizeName("  Investor   Report.pdf  ")).toBe("Investor Report.pdf");
  });

  it("creates a safe suffix before a file extension", () => {
    expect(createUniqueName("Report.pdf", ["Report.pdf", "Report (1).pdf"])).toBe("Report (2).pdf");
  });

  it("detects duplicates case-insensitively", () => {
    expect(() => ensureUniqueName("report.pdf", ["Report.pdf"])).toThrow(DataRoomError);
  });
});
