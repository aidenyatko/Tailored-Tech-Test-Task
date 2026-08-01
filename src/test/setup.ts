import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: vi.fn(() => "blob:test-pdf")
});

Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: vi.fn()
});
