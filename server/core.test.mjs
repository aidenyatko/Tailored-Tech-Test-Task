// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ApiError,
  createDataroom,
  createFileRecord,
  createFolder,
  createInitialDatabase,
  extractPdfSearchText,
  listAccessibleDatarooms,
  login,
  moveItem,
  searchItems,
  updateAccess
} from "./core.mjs";

describe("server core", () => {
  it("authenticates users and lists only accessible data rooms", () => {
    const db = createInitialDatabase();
    const owner = login(db, "owner@acme.test", "owner123").user;
    const viewer = login(db, "viewer@acme.test", "viewer123").user;
    const dataroom = createDataroom(db, owner.id, "Acme Deal");

    updateAccess(db, owner.id, dataroom.id, viewer.id, "viewer");

    expect(listAccessibleDatarooms(db, viewer.id)).toEqual([
      expect.objectContaining({ id: dataroom.id, role: "viewer" })
    ]);
  });

  it("prevents viewers from editing data room contents", () => {
    const db = createInitialDatabase();
    const owner = login(db, "owner@acme.test", "owner123").user;
    const viewer = login(db, "viewer@acme.test", "viewer123").user;
    const dataroom = createDataroom(db, owner.id, "Acme Deal");

    updateAccess(db, owner.id, dataroom.id, viewer.id, "viewer");

    expect(() => createFolder(db, viewer.id, dataroom.id, null, "Legal")).toThrow(ApiError);
  });

  it("stores duplicate PDF names safely and searches indexed PDF text", () => {
    const db = createInitialDatabase();
    const owner = login(db, "owner@acme.test", "owner123").user;
    const dataroom = createDataroom(db, owner.id, "Acme Deal");
    const first = createFileRecord(db, owner.id, dataroom.id, null, {
      name: "Report.pdf",
      mimeType: "application/pdf",
      size: 10,
      searchText: "material revenue contract"
    });
    const second = createFileRecord(db, owner.id, dataroom.id, null, {
      name: "Report.pdf",
      mimeType: "application/pdf",
      size: 10,
      searchText: "tax schedule"
    });

    expect(first.name).toBe("Report.pdf");
    expect(second.name).toBe("Report (1).pdf");
    expect(searchItems(db, owner.id, dataroom.id, "revenue")).toEqual([expect.objectContaining({ id: first.id })]);
  });

  it("prevents moving a folder into its own child", () => {
    const db = createInitialDatabase();
    const owner = login(db, "owner@acme.test", "owner123").user;
    const dataroom = createDataroom(db, owner.id, "Acme Deal");
    const parent = createFolder(db, owner.id, dataroom.id, null, "Parent");
    const child = createFolder(db, owner.id, dataroom.id, parent.id, "Child");

    expect(() => moveItem(db, owner.id, parent.id, child.id)).toThrow(ApiError);
  });

  it("extracts searchable text from simple PDF string operands", () => {
    const pdf = Buffer.from("%PDF-1.4\nBT (Cyberpunk contract alpha) Tj ET\n%%EOF", "utf8");

    expect(extractPdfSearchText(pdf)).toContain("cyberpunk contract alpha");
  });
});
