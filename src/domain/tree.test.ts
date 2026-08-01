import { describe, expect, it } from "vitest";
import { getBreadcrumbs, getFolderDescendantIds, getItemsByParent } from "./tree";
import type { DataRoomItem } from "./types";

const items: DataRoomItem[] = [
  {
    id: "folder-a",
    dataroomId: "room-1",
    parentId: null,
    type: "folder",
    name: "Financials",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "file-a",
    dataroomId: "room-1",
    parentId: "folder-a",
    type: "file",
    name: "Balance Sheet.pdf",
    mimeType: "application/pdf",
    size: 10,
    storageKey: "blob-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "folder-b",
    dataroomId: "room-1",
    parentId: "folder-a",
    type: "folder",
    name: "Archive",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "file-b",
    dataroomId: "room-1",
    parentId: "folder-b",
    type: "file",
    name: "Old Statement.pdf",
    mimeType: "application/pdf",
    size: 10,
    storageKey: "blob-b",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

describe("tree helpers", () => {
  it("returns descendants for cascade deletion", () => {
    expect(getFolderDescendantIds(items, "folder-a")).toEqual(["file-a", "folder-b", "file-b"]);
  });

  it("sorts folders before files", () => {
    expect(getItemsByParent(items, "folder-a").map((item) => item.id)).toEqual(["folder-b", "file-a"]);
  });

  it("builds breadcrumbs from parent folders", () => {
    expect(getBreadcrumbs(items, "folder-b").map((item) => item.name)).toEqual(["Financials", "Archive"]);
  });
});
