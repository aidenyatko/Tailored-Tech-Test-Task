# Client API

This app is frontend-only. The "API" is a typed client storage layer around IndexedDB.

## Core Types

```ts
type EntityId = string;

interface Dataroom {
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface FolderItem {
  id: EntityId;
  dataroomId: EntityId;
  parentId: EntityId | null;
  type: "folder";
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface FileItem {
  id: EntityId;
  dataroomId: EntityId;
  parentId: EntityId | null;
  type: "file";
  name: string;
  mimeType: "application/pdf";
  size: number;
  storageKey: string;
  createdAt: string;
  updatedAt: string;
}
```

## Storage Operations

`DataRoomStorage` exposes these operations:

- `listDatarooms()`: returns all data rooms sorted by name.
- `createDataroom(name)`: creates a top-level data room.
- `renameDataroom(id, name)`: renames a data room if the new name is unique.
- `deleteDataroom(id)`: deletes the data room, all items, and all file bytes.
- `listItems(dataroomId)`: returns all folders and files for one data room.
- `createFolder(dataroomId, parentId, name)`: creates a folder under root or another folder.
- `uploadFile(dataroomId, parentId, file)`: stores one PDF file under root or a folder.
- `renameItem(id, name)`: renames a folder or file if the sibling name is unique.
- `deleteItem(id)`: deletes one file or cascades a folder delete.
- `getFileBlob(storageKey)`: returns a PDF `Blob` for preview.

## Error Codes

The domain layer throws `DataRoomError` with these codes:

- `DATAROOM_NOT_FOUND`
- `ITEM_NOT_FOUND`
- `INVALID_PARENT`
- `INVALID_NAME`
- `DUPLICATE_NAME`
- `INVALID_FILE_TYPE`

## Naming Rules

- Names are trimmed.
- Repeated whitespace is collapsed.
- Names are compared case-insensitively.
- Manual rename cannot collide with another sibling item.
- Upload and create operations generate safe suffixes when needed.

Example:

```text
Report.pdf
Report (1).pdf
Report (2).pdf
```
