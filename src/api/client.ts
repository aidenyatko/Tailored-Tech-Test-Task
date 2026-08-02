import type { AccessRecord, Dataroom, DataroomItem, DataroomRole, User } from "./types";

const TOKEN_KEY = "acme-dataroom-token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }

  localStorage.removeItem(TOKEN_KEY);
}

export function fileContentUrl(itemId: string, token: string) {
  return `/api/files/${itemId}/content?token=${encodeURIComponent(token)}`;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function register(email: string, name: string, password: string) {
  return apiFetch<{ token: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password })
  });
}

export async function me(token: string) {
  return apiFetch<{ user: User }>("/api/auth/me", { token });
}

export async function listUsers(token: string) {
  return apiFetch<{ users: User[] }>("/api/users", { token });
}

export async function listDatarooms(token: string) {
  return apiFetch<{ datarooms: Dataroom[] }>("/api/datarooms", { token });
}

export async function createDataroom(token: string, name: string) {
  return apiFetch<{ dataroom: Dataroom }>("/api/datarooms", {
    method: "POST",
    token,
    body: JSON.stringify({ name })
  });
}

export async function renameDataroom(token: string, id: string, name: string) {
  return apiFetch<{ dataroom: Dataroom }>(`/api/datarooms/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name })
  });
}

export async function deleteDataroom(token: string, id: string) {
  await apiFetch<void>(`/api/datarooms/${id}`, { method: "DELETE", token });
}

export async function listItems(token: string, dataroomId: string, query = "") {
  const search = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch<{ items: DataroomItem[] }>(`/api/datarooms/${dataroomId}/items${search}`, { token });
}

export async function createFolder(token: string, dataroomId: string, parentId: string | null, name: string) {
  return apiFetch<{ item: DataroomItem }>(`/api/datarooms/${dataroomId}/folders`, {
    method: "POST",
    token,
    body: JSON.stringify({ parentId, name })
  });
}

export async function uploadFiles(token: string, dataroomId: string, parentId: string | null, files: File[]) {
  const formData = new FormData();

  if (parentId) {
    formData.append("parentId", parentId);
  }

  for (const file of files) {
    formData.append("files", file);
  }

  return apiFetch<{ items: DataroomItem[] }>(`/api/datarooms/${dataroomId}/files`, {
    method: "POST",
    token,
    body: formData
  });
}

export async function renameItem(token: string, id: string, name: string) {
  return apiFetch<{ item: DataroomItem }>(`/api/items/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name })
  });
}

export async function moveItem(token: string, id: string, parentId: string | null) {
  return apiFetch<{ item: DataroomItem }>(`/api/items/${id}/move`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ parentId })
  });
}

export async function deleteItem(token: string, id: string) {
  await apiFetch<void>(`/api/items/${id}`, { method: "DELETE", token });
}

export async function listAccess(token: string, dataroomId: string) {
  return apiFetch<{ access: AccessRecord[] }>(`/api/datarooms/${dataroomId}/access`, { token });
}

export async function updateAccess(token: string, dataroomId: string, userId: string, role: DataroomRole | null) {
  return apiFetch<{ access: AccessRecord[] }>(`/api/datarooms/${dataroomId}/access/${userId}`, {
    method: "PUT",
    token,
    body: JSON.stringify({ role })
  });
}

export async function updatePublicAccess(token: string, dataroomId: string, role: DataroomRole | null) {
  return apiFetch<{ dataroom: Dataroom }>(`/api/datarooms/${dataroomId}/public-access`, {
    method: "PUT",
    token,
    body: JSON.stringify({ role })
  });
}

interface ApiOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  const hasFormData = options.body instanceof FormData;

  if (!hasFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Request failed.");
  }

  return payload as T;
}
