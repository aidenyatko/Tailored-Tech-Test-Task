// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password utilities", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("owner123");

    expect(hash).not.toBe("owner123");
    expect(verifyPassword("owner123", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});
