import { randomUUID } from "node:crypto";

export const ROLES = ["owner", "editor", "viewer"];

export const DEFAULT_USERS = [
  {
    id: "user-owner",
    email: "owner@acme.test",
    name: "Olivia Owner",
    password: "owner123"
  },
  {
    id: "user-editor",
    email: "editor@acme.test",
    name: "Evan Editor",
    password: "editor123"
  },
  {
    id: "user-viewer",
    email: "viewer@acme.test",
    name: "Val Viewer",
    password: "viewer123"
  }
];

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createInitialDatabase() {
  return {
    users: DEFAULT_USERS,
    sessions: [],
    datarooms: [],
    access: [],
    items: []
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}

export function login(db, email, password) {
  const user = db.users.find((candidate) => candidate.email.toLowerCase() === String(email).toLowerCase());

  if (!user || user.password !== password) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const session = {
    token: randomUUID(),
    userId: user.id,
    createdAt: new Date().toISOString()
  };

  db.sessions.push(session);

  return {
    token: session.token,
    user: publicUser(user)
  };
}

export function getUserByToken(db, token) {
  const session = db.sessions.find((candidate) => candidate.token === token);

  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const user = db.users.find((candidate) => candidate.id === session.userId);

  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  return user;
}

export function listUsers(db) {
  return db.users.map(publicUser).sort((left, right) => left.name.localeCompare(right.name));
}

export function listAccessibleDatarooms(db, userId) {
  return db.datarooms
    .map((room) => ({ ...room, role: getRole(db, room.id, userId) }))
    .filter((room) => room.role)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function createDataroom(db, userId, name) {
  const safeName = ensureUniqueName(name, db.datarooms.filter((room) => room.ownerId === userId).map((room) => room.name));
  const now = new Date().toISOString();
  const dataroom = {
    id: randomUUID(),
    name: safeName,
    ownerId: userId,
    createdAt: now,
    updatedAt: now
  };

  db.datarooms.push(dataroom);
  db.access.push({ dataroomId: dataroom.id, userId, role: "owner" });

  return { ...dataroom, role: "owner" };
}

export function renameDataroom(db, userId, dataroomId, name) {
  requireRole(db, dataroomId, userId, ["owner"]);
  const dataroom = requireDataroom(db, dataroomId);
  const safeName = ensureUniqueName(
    name,
    db.datarooms.filter((room) => room.ownerId === dataroom.ownerId && room.id !== dataroom.id).map((room) => room.name),
    dataroom.name
  );

  dataroom.name = safeName;
  dataroom.updatedAt = new Date().toISOString();

  return { ...dataroom, role: "owner" };
}

export function deleteDataroom(db, userId, dataroomId) {
  requireRole(db, dataroomId, userId, ["owner"]);
  const dataroom = requireDataroom(db, dataroomId);
  const blobKeys = db.items
    .filter((item) => item.dataroomId === dataroom.id && item.type === "file")
    .map((item) => item.blobKey);

  db.datarooms = db.datarooms.filter((room) => room.id !== dataroom.id);
  db.access = db.access.filter((record) => record.dataroomId !== dataroom.id);
  db.items = db.items.filter((item) => item.dataroomId !== dataroom.id);

  return blobKeys;
}

export function listItems(db, userId, dataroomId) {
  requireRole(db, dataroomId, userId, ["owner", "editor", "viewer"]);
  return db.items.filter((item) => item.dataroomId === dataroomId).sort(compareItems);
}

export function createFolder(db, userId, dataroomId, parentId, name) {
  requireRole(db, dataroomId, userId, ["owner", "editor"]);
  prepareParent(db, dataroomId, parentId);
  const now = new Date().toISOString();
  const folder = {
    id: randomUUID(),
    dataroomId,
    parentId: parentId ?? null,
    type: "folder",
    name: createUniqueName(name, getSiblingNames(db.items, dataroomId, parentId ?? null)),
    createdAt: now,
    updatedAt: now
  };

  db.items.push(folder);

  return folder;
}

export function createFileRecord(db, userId, dataroomId, parentId, file) {
  requireRole(db, dataroomId, userId, ["owner", "editor"]);
  prepareParent(db, dataroomId, parentId);

  if (file.mimeType !== "application/pdf") {
    throw new ApiError(400, "INVALID_FILE_TYPE", "Only PDF files can be uploaded.");
  }

  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    dataroomId,
    parentId: parentId ?? null,
    type: "file",
    name: createUniqueName(file.name, getSiblingNames(db.items, dataroomId, parentId ?? null)),
    mimeType: "application/pdf",
    size: file.size,
    blobKey: `${randomUUID()}.pdf`,
    searchText: normalizeSearchText(`${file.name} ${file.searchText ?? ""}`),
    createdAt: now,
    updatedAt: now
  };

  db.items.push(item);

  return item;
}

export function renameItem(db, userId, itemId, name) {
  const item = requireItem(db, itemId);
  requireRole(db, item.dataroomId, userId, ["owner", "editor"]);

  item.name = ensureUniqueName(name, getSiblingNames(db.items, item.dataroomId, item.parentId, item.id), item.name);
  item.searchText = item.type === "file" ? normalizeSearchText(`${item.name} ${item.searchText}`) : item.searchText;
  item.updatedAt = new Date().toISOString();

  return item;
}

export function moveItem(db, userId, itemId, parentId) {
  const item = requireItem(db, itemId);
  requireRole(db, item.dataroomId, userId, ["owner", "editor"]);
  const nextParentId = parentId ?? null;

  if (nextParentId === item.id) {
    throw new ApiError(400, "INVALID_MOVE", "Item cannot be moved into itself.");
  }

  if (nextParentId) {
    const parent = requireItem(db, nextParentId);

    if (parent.dataroomId !== item.dataroomId || parent.type !== "folder") {
      throw new ApiError(400, "INVALID_PARENT", "Target folder was not found.");
    }

    if (item.type === "folder" && getDescendantIds(db.items, item.id).includes(parent.id)) {
      throw new ApiError(400, "INVALID_MOVE", "Folder cannot be moved into its own child.");
    }
  }

  item.parentId = nextParentId;
  item.name = createUniqueName(item.name, getSiblingNames(db.items, item.dataroomId, nextParentId, item.id));
  item.updatedAt = new Date().toISOString();

  return item;
}

export function deleteItem(db, userId, itemId) {
  const item = requireItem(db, itemId);
  requireRole(db, item.dataroomId, userId, ["owner", "editor"]);
  const idsToDelete = item.type === "folder" ? [item.id, ...getDescendantIds(db.items, item.id)] : [item.id];
  const blobKeys = db.items.filter((candidate) => idsToDelete.includes(candidate.id) && candidate.type === "file").map((file) => file.blobKey);

  db.items = db.items.filter((candidate) => !idsToDelete.includes(candidate.id));

  return blobKeys;
}

export function searchItems(db, userId, dataroomId, query) {
  requireRole(db, dataroomId, userId, ["owner", "editor", "viewer"]);
  const normalized = normalizeSearchText(query);

  if (!normalized) {
    return listItems(db, userId, dataroomId);
  }

  return db.items
    .filter((item) => item.dataroomId === dataroomId)
    .filter((item) => normalizeSearchText(`${item.name} ${item.searchText ?? ""}`).includes(normalized))
    .sort(compareItems);
}

export function listAccess(db, userId, dataroomId) {
  requireRole(db, dataroomId, userId, ["owner"]);
  return db.access
    .filter((record) => record.dataroomId === dataroomId)
    .map((record) => ({
      ...record,
      user: publicUser(db.users.find((user) => user.id === record.userId))
    }))
    .sort((left, right) => left.user.name.localeCompare(right.user.name));
}

export function updateAccess(db, userId, dataroomId, targetUserId, role) {
  requireRole(db, dataroomId, userId, ["owner"]);
  const dataroom = requireDataroom(db, dataroomId);
  const targetUser = db.users.find((user) => user.id === targetUserId);

  if (!targetUser) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found.");
  }

  if (targetUserId === dataroom.ownerId) {
    throw new ApiError(400, "OWNER_ACCESS_LOCKED", "Owner access cannot be changed.");
  }

  if (role === null) {
    db.access = db.access.filter((record) => !(record.dataroomId === dataroomId && record.userId === targetUserId));
    return listAccess(db, userId, dataroomId);
  }

  if (!ROLES.includes(role) || role === "owner") {
    throw new ApiError(400, "INVALID_ROLE", "Role must be editor or viewer.");
  }

  const existing = db.access.find((record) => record.dataroomId === dataroomId && record.userId === targetUserId);

  if (existing) {
    existing.role = role;
  } else {
    db.access.push({ dataroomId, userId: targetUserId, role });
  }

  return listAccess(db, userId, dataroomId);
}

export function getFileForRead(db, userId, itemId) {
  const item = requireItem(db, itemId);

  if (item.type !== "file") {
    throw new ApiError(404, "FILE_NOT_FOUND", "File was not found.");
  }

  requireRole(db, item.dataroomId, userId, ["owner", "editor", "viewer"]);

  return item;
}

export function extractPdfSearchText(buffer) {
  const source = buffer.toString("latin1");
  const strings = [];
  const textOperands = source.match(/\((?:\\.|[^\\)])*\)/g) ?? [];

  for (const operand of textOperands) {
    strings.push(decodePdfString(operand.slice(1, -1)));
  }

  strings.push(source.replace(/[^\x20-\x7EА-Яа-яЁё]+/g, " "));

  return normalizeSearchText(strings.join(" "));
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getRole(db, dataroomId, userId) {
  const record = db.access.find((candidate) => candidate.dataroomId === dataroomId && candidate.userId === userId);
  return record?.role ?? null;
}

function requireRole(db, dataroomId, userId, roles) {
  requireDataroom(db, dataroomId);
  const role = getRole(db, dataroomId, userId);

  if (!role || !roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to this data room.");
  }

  return role;
}

function requireDataroom(db, dataroomId) {
  const dataroom = db.datarooms.find((room) => room.id === dataroomId);

  if (!dataroom) {
    throw new ApiError(404, "DATAROOM_NOT_FOUND", "Data room was not found.");
  }

  return dataroom;
}

function requireItem(db, itemId) {
  const item = db.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new ApiError(404, "ITEM_NOT_FOUND", "Item was not found.");
  }

  return item;
}

function prepareParent(db, dataroomId, parentId) {
  requireDataroom(db, dataroomId);

  if (!parentId) {
    return null;
  }

  const parent = requireItem(db, parentId);

  if (parent.dataroomId !== dataroomId || parent.type !== "folder") {
    throw new ApiError(400, "INVALID_PARENT", "Parent folder was not found.");
  }

  return parent;
}

function ensureUniqueName(value, existingNames, currentName = null) {
  const name = cleanName(value);

  if (currentName && name.localeCompare(currentName, undefined, { sensitivity: "base" }) === 0) {
    return currentName;
  }

  if (existingNames.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) {
    throw new ApiError(409, "DUPLICATE_NAME", "Name already exists.");
  }

  return name;
}

function createUniqueName(value, existingNames) {
  const name = cleanName(value);

  if (!existingNames.some((existing) => existing.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) {
    return name;
  }

  const { base, extension } = splitName(name);
  let counter = 1;
  let candidate = `${base} (${counter})${extension}`;

  while (existingNames.some((existing) => existing.localeCompare(candidate, undefined, { sensitivity: "base" }) === 0)) {
    counter += 1;
    candidate = `${base} (${counter})${extension}`;
  }

  return candidate;
}

function cleanName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");

  if (!name) {
    throw new ApiError(400, "INVALID_NAME", "Name is required.");
  }

  if (name.length > 120) {
    throw new ApiError(400, "INVALID_NAME", "Name must be 120 characters or fewer.");
  }

  return name;
}

function splitName(name) {
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex <= 0) {
    return { base: name, extension: "" };
  }

  return {
    base: name.slice(0, dotIndex),
    extension: name.slice(dotIndex)
  };
}

function getSiblingNames(items, dataroomId, parentId, exceptId = null) {
  return items
    .filter((item) => item.dataroomId === dataroomId && item.parentId === parentId && item.id !== exceptId)
    .map((item) => item.name);
}

function getDescendantIds(items, folderId) {
  const result = [];
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = items.filter((item) => item.parentId === currentId);

    for (const child of children) {
      result.push(child.id);

      if (child.type === "folder") {
        queue.push(child.id);
      }
    }
  }

  return result;
}

function compareItems(left, right) {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function decodePdfString(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1");
}
