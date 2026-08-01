export type EntityId = string;

export interface Dataroom {
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaseItem {
  id: EntityId;
  dataroomId: EntityId;
  parentId: EntityId | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem extends BaseItem {
  type: "folder";
}

export interface FileItem extends BaseItem {
  type: "file";
  mimeType: "application/pdf";
  size: number;
  storageKey: string;
}

export type DataRoomItem = FolderItem | FileItem;

export interface FileBlobRecord {
  key: string;
  data: ArrayBuffer;
  mimeType: "application/pdf";
  createdAt: string;
}

export interface DataroomSnapshot {
  datarooms: Dataroom[];
  items: DataRoomItem[];
}
