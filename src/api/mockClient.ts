import type { AccessRecord, Dataroom, DataroomItem, DataroomRole, FileItem, User } from "./types";

type MockState = {
  version?: number;
  users: User[];
  datarooms: Dataroom[];
  items: DataroomItem[];
  access: AccessRecord[];
};

const STATE_KEY = "acme-dataroom-demo-state";
const STATE_VERSION = 2;
const TOKEN_PREFIX = "mock-token:";
const DEMO_RESUME_URL = "/demo/Dmytro_Kiselov_Full-Stack_Developer.pdf";

const objectUrls = new Map<string, string>();

export function fileContentUrl(itemId: string) {
  return objectUrls.get(itemId) ?? DEMO_RESUME_URL;
}

export async function login(email: string, password: string) {
  const state = loadState();
  const user = state.users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());

  if (!user || !isValidDemoPassword(user.email, password)) {
    throw new Error("Invalid email or password.");
  }

  return { token: tokenFor(user.id), user };
}

export async function register(email: string, name: string, password: string) {
  const state = loadState();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !name.trim() || password.length < 3) {
    throw new Error("Enter name, email, and password.");
  }

  if (state.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error("User already exists.");
  }

  const user: User = { id: newId("user"), email: normalizedEmail, name: name.trim() };
  state.users.push(user);
  saveState(state);

  return { token: tokenFor(user.id), user };
}

export async function me(token: string) {
  return { user: requireUser(loadState(), token) };
}

export async function listUsers(token: string) {
  requireUser(loadState(), token);
  return { users: loadState().users };
}

export async function listDatarooms(token: string) {
  const state = loadState();
  const user = requireUser(state, token);
  const datarooms = state.datarooms
    .map((dataroom) => {
      const direct = state.access.find((record) => record.dataroomId === dataroom.id && record.userId === user.id);
      const role = direct?.role ?? dataroom.publicRole;

      return role ? { ...dataroom, role } : null;
    })
    .filter((dataroom): dataroom is Dataroom => Boolean(dataroom));

  return { datarooms };
}

export async function createDataroom(token: string, name: string) {
  const state = loadState();
  const user = requireUser(state, token);
  const now = nowIso();
  const dataroom: Dataroom = {
    id: newId("room"),
    name: uniqueName(name.trim() || "Untitled data room", state.datarooms.filter((room) => room.ownerId === user.id).map((room) => room.name)),
    ownerId: user.id,
    publicRole: null,
    owner: user,
    role: "OWNER",
    createdAt: now,
    updatedAt: now
  };

  state.datarooms.push(dataroom);
  state.access.push({ id: newId("access"), dataroomId: dataroom.id, userId: user.id, role: "OWNER", user });
  saveState(state);

  return { dataroom };
}

export async function renameDataroom(token: string, id: string, name: string) {
  const state = loadState();
  requireRole(state, token, id, "OWNER");
  const dataroom = requireDataroom(state, id);
  dataroom.name = name.trim() || dataroom.name;
  dataroom.updatedAt = nowIso();
  saveState(state);

  return { dataroom };
}

export async function deleteDataroom(token: string, id: string) {
  const state = loadState();
  requireRole(state, token, id, "OWNER");
  state.datarooms = state.datarooms.filter((dataroom) => dataroom.id !== id);
  state.items = state.items.filter((item) => item.dataroomId !== id);
  state.access = state.access.filter((record) => record.dataroomId !== id);
  saveState(state);
}

export async function listItems(token: string, dataroomId: string, query = "") {
  const state = loadState();
  requireRole(state, token, dataroomId, "VIEWER");
  const normalizedQuery = query.trim().toLowerCase();
  const items = state.items.filter((item) => {
    if (item.dataroomId !== dataroomId) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchText = item.type === "FILE" ? item.searchText : "";
    return `${item.name} ${searchText}`.toLowerCase().includes(normalizedQuery);
  });

  return { items };
}

export async function createFolder(token: string, dataroomId: string, parentId: string | null, name: string) {
  const state = loadState();
  requireRole(state, token, dataroomId, "EDITOR");
  assertParentExists(state, dataroomId, parentId);
  const now = nowIso();
  const item: DataroomItem = {
    id: newId("folder"),
    dataroomId,
    parentId,
    type: "FOLDER",
    name: uniqueName(name.trim() || "New Folder", siblingNames(state, dataroomId, parentId)),
    createdAt: now,
    updatedAt: now
  };

  state.items.push(item);
  saveState(state);

  return { item };
}

export async function uploadFiles(token: string, dataroomId: string, parentId: string | null, files: File[]) {
  const state = loadState();
  requireRole(state, token, dataroomId, "EDITOR");
  assertParentExists(state, dataroomId, parentId);
  const now = nowIso();
  const created = files.map((file): FileItem => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF files are supported.");
    }

    const item: FileItem = {
      id: newId("file"),
      dataroomId,
      parentId,
      type: "FILE",
      name: uniqueName(file.name, siblingNames(state, dataroomId, parentId)),
      mimeType: "application/pdf",
      size: file.size,
      blobKey: file.name,
      searchText: `${file.name} uploaded pdf demo contract revenue diligence`,
      createdAt: now,
      updatedAt: now
    };

    objectUrls.set(item.id, URL.createObjectURL(file));
    state.items.push(item);
    return item;
  });

  saveState(state);
  return { items: created };
}

export async function renameItem(token: string, id: string, name: string) {
  const state = loadState();
  const item = requireItem(state, id);
  requireRole(state, token, item.dataroomId, "EDITOR");
  item.name = uniqueName(name.trim() || item.name, siblingNames(state, item.dataroomId, item.parentId, item.id));
  item.updatedAt = nowIso();
  saveState(state);

  return { item };
}

export async function moveItem(token: string, id: string, parentId: string | null) {
  const state = loadState();
  const item = requireItem(state, id);
  requireRole(state, token, item.dataroomId, "EDITOR");
  assertParentExists(state, item.dataroomId, parentId);

  if (item.type === "FOLDER" && parentId && isDescendant(state.items, parentId, item.id)) {
    throw new Error("Cannot move a folder into itself or its descendant.");
  }

  item.parentId = parentId;
  item.name = uniqueName(item.name, siblingNames(state, item.dataroomId, parentId, item.id));
  item.updatedAt = nowIso();
  saveState(state);

  return { item };
}

export async function deleteItem(token: string, id: string) {
  const state = loadState();
  const item = requireItem(state, id);
  requireRole(state, token, item.dataroomId, "EDITOR");
  const deletedIds = new Set([id]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of state.items) {
      if (candidate.parentId && deletedIds.has(candidate.parentId) && !deletedIds.has(candidate.id)) {
        deletedIds.add(candidate.id);
        changed = true;
      }
    }
  }

  state.items = state.items.filter((candidate) => !deletedIds.has(candidate.id));
  saveState(state);
}

export async function listAccess(token: string, dataroomId: string) {
  const state = loadState();
  requireRole(state, token, dataroomId, "OWNER");
  return { access: state.access.filter((record) => record.dataroomId === dataroomId) };
}

export async function updateAccess(token: string, dataroomId: string, userId: string, role: DataroomRole | null) {
  const state = loadState();
  requireRole(state, token, dataroomId, "OWNER");
  const user = state.users.find((candidate) => candidate.id === userId);

  if (!user) {
    throw new Error("User not found.");
  }

  const current = state.access.find((record) => record.dataroomId === dataroomId && record.userId === userId);

  if (current?.role === "OWNER") {
    throw new Error("Owner access cannot be changed.");
  }

  state.access = state.access.filter((record) => !(record.dataroomId === dataroomId && record.userId === userId));

  if (role) {
    state.access.push({ id: current?.id ?? newId("access"), dataroomId, userId, role, user });
  }

  saveState(state);
  return { access: state.access.filter((record) => record.dataroomId === dataroomId) };
}

export async function updatePublicAccess(token: string, dataroomId: string, role: DataroomRole | null) {
  const state = loadState();
  requireRole(state, token, dataroomId, "OWNER");

  if (role === "OWNER") {
    throw new Error("Public owner access is not allowed.");
  }

  const dataroom = requireDataroom(state, dataroomId);
  dataroom.publicRole = role;
  dataroom.updatedAt = nowIso();
  saveState(state);

  return { dataroom };
}

function loadState(): MockState {
  const stored = localStorage.getItem(STATE_KEY);

  if (stored) {
    const state = JSON.parse(stored) as MockState;

    if (state.version === STATE_VERSION) {
      return state;
    }
  }

  const state = seedState();
  saveState(state);
  return state;
}

function saveState(state: MockState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function seedState(): MockState {
  const owner: User = { id: "user-owner", email: "owner@acme.test", name: "Olivia Owner" };
  const editor: User = { id: "user-editor", email: "editor@acme.test", name: "Evan Editor" };
  const viewer: User = { id: "user-viewer", email: "viewer@acme.test", name: "Val Viewer" };
  const now = nowIso();
  const room: Dataroom = {
    id: "room-acme",
    name: "Acme Acquisition",
    ownerId: owner.id,
    publicRole: null,
    owner,
    role: "OWNER",
    createdAt: now,
    updatedAt: now
  };
  const resumeFolder: DataroomItem = {
    id: "folder-candidate-cv",
    dataroomId: room.id,
    parentId: null,
    type: "FOLDER",
    name: "Candidate CV",
    createdAt: now,
    updatedAt: now
  };
  const fullStackResume: FileItem = {
    id: "file-dmytro-full-stack-resume",
    dataroomId: room.id,
    parentId: resumeFolder.id,
    type: "FILE",
    name: "Dmytro_Kiselov_Full-Stack_Developer.pdf",
    mimeType: "application/pdf",
    size: 88533,
    blobKey: DEMO_RESUME_URL,
    searchText: "dmytro kiselov full-stack developer react typescript node nestjs postgresql docker ai qa backend frontend",
    createdAt: now,
    updatedAt: now
  };

  return {
    version: STATE_VERSION,
    users: [owner, editor, viewer],
    datarooms: [room],
    items: [resumeFolder, fullStackResume],
    access: [
      { id: "access-owner", dataroomId: room.id, userId: owner.id, role: "OWNER", user: owner },
      { id: "access-editor", dataroomId: room.id, userId: editor.id, role: "EDITOR", user: editor },
      { id: "access-viewer", dataroomId: room.id, userId: viewer.id, role: "VIEWER", user: viewer }
    ]
  };
}

function requireUser(state: MockState, token: string) {
  const userId = token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : "";
  const user = state.users.find((candidate) => candidate.id === userId);

  if (!user) {
    throw new Error("Session expired. Sign in again.");
  }

  return user;
}

function requireRole(state: MockState, token: string, dataroomId: string, minimumRole: DataroomRole) {
  const user = requireUser(state, token);
  const dataroom = requireDataroom(state, dataroomId);
  const direct = state.access.find((record) => record.dataroomId === dataroomId && record.userId === user.id);
  const role = direct?.role ?? dataroom.publicRole;

  if (!role || roleRank(role) < roleRank(minimumRole)) {
    throw new Error("You do not have access to this action.");
  }

  return role;
}

function requireDataroom(state: MockState, dataroomId: string) {
  const dataroom = state.datarooms.find((candidate) => candidate.id === dataroomId);

  if (!dataroom) {
    throw new Error("Data room not found.");
  }

  return dataroom;
}

function requireItem(state: MockState, id: string) {
  const item = state.items.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error("Item not found.");
  }

  return item;
}

function assertParentExists(state: MockState, dataroomId: string, parentId: string | null) {
  if (!parentId) {
    return;
  }

  const parent = state.items.find((item) => item.id === parentId && item.dataroomId === dataroomId && item.type === "FOLDER");

  if (!parent) {
    throw new Error("Destination folder not found.");
  }
}

function siblingNames(state: MockState, dataroomId: string, parentId: string | null, ignoreId?: string) {
  return state.items
    .filter((item) => item.dataroomId === dataroomId && item.parentId === parentId && item.id !== ignoreId)
    .map((item) => item.name);
}

function uniqueName(name: string, existingNames: string[]) {
  if (!existingNames.includes(name)) {
    return name;
  }

  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  let index = 1;
  let candidate = `${base} (${index})${extension}`;

  while (existingNames.includes(candidate)) {
    index += 1;
    candidate = `${base} (${index})${extension}`;
  }

  return candidate;
}

function isDescendant(items: DataroomItem[], candidateId: string, ancestorId: string) {
  let current = items.find((item) => item.id === candidateId);

  while (current) {
    if (current.parentId === ancestorId) {
      return true;
    }

    current = current.parentId ? items.find((item) => item.id === current?.parentId) : undefined;
  }

  return false;
}

function roleRank(role: DataroomRole) {
  return { VIEWER: 1, EDITOR: 2, OWNER: 3 }[role];
}

function tokenFor(userId: string) {
  return `${TOKEN_PREFIX}${userId}`;
}

function isValidDemoPassword(email: string, password: string) {
  const expected: Record<string, string> = {
    "owner@acme.test": "owner123",
    "editor@acme.test": "editor123",
    "viewer@acme.test": "viewer123"
  };

  return expected[email] ? expected[email] === password : password.length >= 3;
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}
