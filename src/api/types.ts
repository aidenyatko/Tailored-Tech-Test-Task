export type DataroomRole = "OWNER" | "EDITOR" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Dataroom {
  id: string;
  name: string;
  ownerId: string;
  publicRole: DataroomRole | null;
  owner?: User;
  role: DataroomRole;
  createdAt: string;
  updatedAt: string;
}

export interface BaseItem {
  id: string;
  dataroomId: string;
  parentId: string | null;
  type: "FOLDER" | "FILE";
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem extends BaseItem {
  type: "FOLDER";
}

export interface FileItem extends BaseItem {
  type: "FILE";
  mimeType: "application/pdf";
  size: number;
  blobKey: string;
  searchText: string;
}

export type DataroomItem = FolderItem | FileItem;

export interface AccessRecord {
  id: string;
  dataroomId: string;
  userId: string;
  role: DataroomRole;
  user: User;
}
