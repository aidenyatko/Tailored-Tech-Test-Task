// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf-indexer.js";

describe("pdf indexer", () => {
  it("extracts searchable text from simple PDF strings", () => {
    const pdf = Buffer.from("%PDF-1.4\nBT (material revenue contract) Tj ET\n%%EOF", "utf8");

    expect(extractPdfText(pdf)).toContain("material revenue contract");
  });
});
