import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DataRoomError } from "../domain/errors";
import { createUniqueName, ensureUniqueName } from "../domain/name";
import { getFolderDescendantIds, getSiblingNames } from "../domain/tree";
import type { DataRoomItem, Dataroom, EntityId, FileBlobRecord, FileItem, FolderItem } from "../domain/types";

interface DataRoomDatabase extends DBSchema {
  datarooms: {
    key: EntityId;
    value: Dataroom;
  };
  items: {
    key: EntityId;
    value: DataRoomItem;
    indexes: {
      "by-dataroom": EntityId;
      "by-storage-key": string;
    };
  };
  blobs: {
    key: string;
    value: FileBlobRecord;
  };
}

export class DataRoomStorage {
  private dbPromise: Promise<IDBPDatabase<DataRoomDatabase>>;

  constructor(dbName = "acme-data-room") {
    this.dbPromise = openDB<DataRoomDatabase>(dbName, 1, {
      upgrade(db) {
        db.createObjectStore("datarooms", { keyPath: "id" });
        const itemStore = db.createObjectStore("items", { keyPath: "id" });
        itemStore.createIndex("by-dataroom", "dataroomId");
        itemStore.createIndex("by-storage-key", "storageKey");
        db.createObjectStore("blobs", { keyPath: "key" });
      }
    });
  }

  async listDatarooms() {
    const db = await this.dbPromise;
    const datarooms = await db.getAll("datarooms");
    return datarooms.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }

  async createDataroom(name: string) {
    const db = await this.dbPromise;
    const existing = await db.getAll("datarooms");
    const safeName = ensureUniqueName(name, existing.map((room) => room.name));
    const now = new Date().toISOString();
    const dataroom: Dataroom = {
      id: crypto.randomUUID(),
      name: safeName,
      createdAt: now,
      updatedAt: now
    };

    await db.add("datarooms", dataroom);
    return dataroom;
  }

  async renameDataroom(id: EntityId, name: string) {
    const db = await this.dbPromise;
    const existing = await db.getAll("datarooms");
    const dataroom = existing.find((room) => room.id === id);

    if (!dataroom) {
      throw new DataRoomError("DATAROOM_NOT_FOUND", "Data room was not found.");
    }

    const nextName = ensureUniqueName(
      name,
      existing.filter((room) => room.id !== id).map((room) => room.name),
      dataroom.name
    );
    const updated = { ...dataroom, name: nextName, updatedAt: new Date().toISOString() };
    await db.put("datarooms", updated);
    return updated;
  }

  async deleteDataroom(id: EntityId) {
    const db = await this.dbPromise;
    const tx = db.transaction(["datarooms", "items", "blobs"], "readwrite");
    const dataroom = await tx.objectStore("datarooms").get(id);

    if (!dataroom) {
      throw new DataRoomError("DATAROOM_NOT_FOUND", "Data room was not found.");
    }

    const items = await tx.objectStore("items").index("by-dataroom").getAll(id);
    await tx.objectStore("datarooms").delete(id);

    for (const item of items) {
      await tx.objectStore("items").delete(item.id);
      if (item.type === "file") {
        await tx.objectStore("blobs").delete(item.storageKey);
      }
    }

    await tx.done;
  }

  async listItems(dataroomId: EntityId) {
    const db = await this.dbPromise;
    await this.requireDataroom(db, dataroomId);
    return db.getAllFromIndex("items", "by-dataroom", dataroomId);
  }

  async createFolder(dataroomId: EntityId, parentId: EntityId | null, name: string) {
    const db = await this.dbPromise;
    const items = await this.prepareParent(db, dataroomId, parentId);
    const safeName = createUniqueName(name, getSiblingNames(items, dataroomId, parentId));
    const now = new Date().toISOString();
    const folder: FolderItem = {
      id: crypto.randomUUID(),
      dataroomId,
      parentId,
      type: "folder",
      name: safeName,
      createdAt: now,
      updatedAt: now
    };

    await db.add("items", folder);
    return folder;
  }

  async uploadFile(dataroomId: EntityId, parentId: EntityId | null, file: File) {
    if (file.type !== "application/pdf") {
      throw new DataRoomError("INVALID_FILE_TYPE", "Only PDF files can be uploaded.");
    }

    const db = await this.dbPromise;
    const items = await this.prepareParent(db, dataroomId, parentId);
    const safeName = createUniqueName(file.name, getSiblingNames(items, dataroomId, parentId));
    const now = new Date().toISOString();
    const storageKey = crypto.randomUUID();
    const data = await file.arrayBuffer();
    const item: FileItem = {
      id: crypto.randomUUID(),
      dataroomId,
      parentId,
      type: "file",
      name: safeName,
      mimeType: "application/pdf",
      size: file.size,
      storageKey,
      createdAt: now,
      updatedAt: now
    };

    const tx = db.transaction(["items", "blobs"], "readwrite");
    await tx.objectStore("blobs").add({ key: storageKey, data, mimeType: "application/pdf", createdAt: now });
    await tx.objectStore("items").add(item);
    await tx.done;

    return item;
  }

  async renameItem(id: EntityId, name: string) {
    const db = await this.dbPromise;
    const item = await db.get("items", id);

    if (!item) {
      throw new DataRoomError("ITEM_NOT_FOUND", "Item was not found.");
    }

    const items = await db.getAllFromIndex("items", "by-dataroom", item.dataroomId);
    const safeName = ensureUniqueName(name, getSiblingNames(items, item.dataroomId, item.parentId, id), item.name);
    const updated = { ...item, name: safeName, updatedAt: new Date().toISOString() };
    await db.put("items", updated);
    return updated;
  }

  async deleteItem(id: EntityId) {
    const db = await this.dbPromise;
    const item = await db.get("items", id);

    if (!item) {
      throw new DataRoomError("ITEM_NOT_FOUND", "Item was not found.");
    }

    const dataroomItems = await db.getAllFromIndex("items", "by-dataroom", item.dataroomId);
    const idsToDelete = item.type === "folder" ? [item.id, ...getFolderDescendantIds(dataroomItems, item.id)] : [item.id];
    const tx = db.transaction(["items", "blobs"], "readwrite");

    for (const itemId of idsToDelete) {
      const current = dataroomItems.find((candidate) => candidate.id === itemId);
      await tx.objectStore("items").delete(itemId);

      if (current?.type === "file") {
        await tx.objectStore("blobs").delete(current.storageKey);
      }
    }

    await tx.done;
  }

  async getFileBlob(storageKey: string) {
    const db = await this.dbPromise;
    const record = await db.get("blobs", storageKey);
    return record ? new Blob([record.data], { type: record.mimeType }) : null;
  }

  async clear() {
    const db = await this.dbPromise;
    const tx = db.transaction(["datarooms", "items", "blobs"], "readwrite");
    await Promise.all([
      tx.objectStore("datarooms").clear(),
      tx.objectStore("items").clear(),
      tx.objectStore("blobs").clear()
    ]);
    await tx.done;
  }

  private async prepareParent(db: IDBPDatabase<DataRoomDatabase>, dataroomId: EntityId, parentId: EntityId | null) {
    await this.requireDataroom(db, dataroomId);
    const items = await db.getAllFromIndex("items", "by-dataroom", dataroomId);

    if (parentId) {
      const parent = items.find((item) => item.id === parentId);

      if (!parent || parent.type !== "folder") {
        throw new DataRoomError("INVALID_PARENT", "Parent folder was not found.");
      }
    }

    return items;
  }

  private async requireDataroom(db: IDBPDatabase<DataRoomDatabase>, dataroomId: EntityId) {
    const dataroom = await db.get("datarooms", dataroomId);

    if (!dataroom) {
      throw new DataRoomError("DATAROOM_NOT_FOUND", "Data room was not found.");
    }

    return dataroom;
  }
}
