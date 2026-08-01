import { DataRoomError } from "./errors";
import type { DataRoomItem, EntityId, FileItem, FolderItem } from "./types";

export function getItemsByParent(items: DataRoomItem[], parentId: EntityId | null) {
  return sortDataRoomItems(items.filter((item) => item.parentId === parentId));
}

export function sortDataRoomItems(items: DataRoomItem[]) {
  return [...items].sort(compareItems);
}

export function getFolderDescendantIds(items: DataRoomItem[], folderId: EntityId) {
  const descendants: EntityId[] = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = items.filter((item) => item.parentId === currentId);

    for (const child of children) {
      descendants.push(child.id);
      if (child.type === "folder") {
        queue.push(child.id);
      }
    }
  }

  return descendants;
}

export function getBreadcrumbs(items: DataRoomItem[], parentId: EntityId | null) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const breadcrumbs: FolderItem[] = [];
  let currentId = parentId;

  while (currentId) {
    const item = byId.get(currentId);

    if (!item || item.type !== "folder") {
      throw new DataRoomError("INVALID_PARENT", "Folder path is broken.");
    }

    breadcrumbs.unshift(item);
    currentId = item.parentId;
  }

  return breadcrumbs;
}

export function getSiblingNames(
  items: DataRoomItem[],
  dataroomId: EntityId,
  parentId: EntityId | null,
  excludeId?: EntityId
) {
  return items
    .filter((item) => item.dataroomId === dataroomId && item.parentId === parentId && item.id !== excludeId)
    .map((item) => item.name);
}

function compareItems(left: DataRoomItem, right: DataRoomItem) {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

export function isFileItem(item: DataRoomItem): item is FileItem {
  return item.type === "file";
}

export function isFolderItem(item: DataRoomItem): item is FolderItem {
  return item.type === "folder";
}
