import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApiError,
  createDataroom,
  createFileRecord,
  createFolder,
  createInitialDatabase,
  deleteDataroom,
  deleteItem,
  extractPdfSearchText,
  getFileForRead,
  getUserByToken,
  listAccess,
  listAccessibleDatarooms,
  listItems,
  listUsers,
  login,
  moveItem,
  renameDataroom,
  renameItem,
  searchItems,
  updateAccess
} from "./core.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataRoot = resolve(process.env.DATA_ROOT ?? join(projectRoot, "server-data"));
const publicRoot = resolve(process.env.PUBLIC_ROOT ?? join(projectRoot, "dist"));
const blobRoot = join(dataRoot, "blobs");
const dbPath = join(dataRoot, "db.json");
const port = Number(process.env.PORT ?? 8080);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 50 * 1024 * 1024);

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => sendError(response, error));
});

server.listen(port, () => {
  process.stdout.write(`Data room server listening on ${port}\n`);
});

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  await serveStatic(response, url.pathname);
}

async function handleApi(request, response, url) {
  const method = request.method ?? "GET";
  const parts = url.pathname.split("/").filter(Boolean);
  const db = await loadDatabase();

  if (method === "POST" && parts[1] === "auth" && parts[2] === "login") {
    const body = await readJson(request);
    const result = login(db, body.email, body.password);
    await saveDatabase(db);
    sendJson(response, 200, result);
    return;
  }

  const user = getUserByToken(db, getBearerToken(request));

  if (method === "GET" && parts[1] === "auth" && parts[2] === "me") {
    sendJson(response, 200, { user: sanitizeUser(user) });
    return;
  }

  if (method === "GET" && parts[1] === "users") {
    sendJson(response, 200, { users: listUsers(db) });
    return;
  }

  if (method === "GET" && parts[1] === "datarooms" && parts.length === 2) {
    sendJson(response, 200, { datarooms: listAccessibleDatarooms(db, user.id) });
    return;
  }

  if (method === "POST" && parts[1] === "datarooms" && parts.length === 2) {
    const body = await readJson(request);
    const dataroom = createDataroom(db, user.id, body.name);
    await saveDatabase(db);
    sendJson(response, 201, { dataroom });
    return;
  }

  if (method === "PATCH" && parts[1] === "datarooms" && parts.length === 3) {
    const body = await readJson(request);
    const dataroom = renameDataroom(db, user.id, parts[2], body.name);
    await saveDatabase(db);
    sendJson(response, 200, { dataroom });
    return;
  }

  if (method === "DELETE" && parts[1] === "datarooms" && parts.length === 3) {
    const blobKeys = deleteDataroom(db, user.id, parts[2]);
    await saveDatabase(db);
    await deleteBlobs(blobKeys);
    sendJson(response, 204, null);
    return;
  }

  if (method === "GET" && parts[1] === "datarooms" && parts[3] === "items") {
    const query = url.searchParams.get("q") ?? "";
    const items = query ? searchItems(db, user.id, parts[2], query) : listItems(db, user.id, parts[2]);
    sendJson(response, 200, { items });
    return;
  }

  if (method === "POST" && parts[1] === "datarooms" && parts[3] === "folders") {
    const body = await readJson(request);
    const item = createFolder(db, user.id, parts[2], body.parentId ?? null, body.name);
    await saveDatabase(db);
    sendJson(response, 201, { item });
    return;
  }

  if (method === "POST" && parts[1] === "datarooms" && parts[3] === "files") {
    const multipart = await readMultipart(request);
    const parentId = multipart.fields.parentId || null;
    const created = [];

    for (const file of multipart.files) {
      const searchText = extractPdfSearchText(file.buffer);
      const item = createFileRecord(db, user.id, parts[2], parentId, {
        name: file.filename,
        mimeType: file.mimeType,
        size: file.buffer.length,
        searchText
      });
      await mkdir(blobRoot, { recursive: true });
      await writeFile(join(blobRoot, item.blobKey), file.buffer);
      created.push(item);
    }

    await saveDatabase(db);
    sendJson(response, 201, { items: created });
    return;
  }

  if (method === "PATCH" && parts[1] === "items" && parts.length === 3) {
    const body = await readJson(request);
    const item = renameItem(db, user.id, parts[2], body.name);
    await saveDatabase(db);
    sendJson(response, 200, { item });
    return;
  }

  if (method === "PATCH" && parts[1] === "items" && parts[3] === "move") {
    const body = await readJson(request);
    const item = moveItem(db, user.id, parts[2], body.parentId ?? null);
    await saveDatabase(db);
    sendJson(response, 200, { item });
    return;
  }

  if (method === "DELETE" && parts[1] === "items" && parts.length === 3) {
    const blobKeys = deleteItem(db, user.id, parts[2]);
    await saveDatabase(db);
    await deleteBlobs(blobKeys);
    sendJson(response, 204, null);
    return;
  }

  if (method === "GET" && parts[1] === "files" && parts[3] === "content") {
    const file = getFileForRead(db, user.id, parts[2]);
    await streamBlob(response, file);
    return;
  }

  if (method === "GET" && parts[1] === "datarooms" && parts[3] === "access") {
    sendJson(response, 200, { access: listAccess(db, user.id, parts[2]) });
    return;
  }

  if (method === "PUT" && parts[1] === "datarooms" && parts[3] === "access" && parts.length === 5) {
    const body = await readJson(request);
    const access = updateAccess(db, user.id, parts[2], parts[4], body.role ?? null);
    await saveDatabase(db);
    sendJson(response, 200, { access });
    return;
  }

  throw new ApiError(404, "NOT_FOUND", "Route was not found.");
}

async function loadDatabase() {
  await mkdir(dataRoot, { recursive: true });
  await mkdir(blobRoot, { recursive: true });

  try {
    return JSON.parse(await readFile(dbPath, "utf8"));
  } catch {
    const db = createInitialDatabase();
    await saveDatabase(db);
    return db;
  }
}

async function saveDatabase(db) {
  await mkdir(dataRoot, { recursive: true });
  const tmpPath = `${dbPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await rename(tmpPath, dbPath);
}

async function readJson(request) {
  const buffer = await readBody(request);

  if (buffer.length === 0) {
    return {};
  }

  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

async function readMultipart(request) {
  const contentType = request.headers["content-type"] ?? "";
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);

  if (!boundaryMatch) {
    throw new ApiError(400, "INVALID_MULTIPART", "Multipart boundary is required.");
  }

  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const body = (await readBody(request)).toString("latin1");
  const chunks = body.split(`--${boundary}`).slice(1, -1);
  const fields = {};
  const files = [];

  for (const chunk of chunks) {
    const part = chunk.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separator = part.indexOf("\r\n\r\n");

    if (separator === -1) {
      continue;
    }

    const headerText = part.slice(0, separator);
    const content = part.slice(separator + 4).replace(/\r\n$/, "");
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headerText);
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "application/octet-stream";

    if (!disposition) {
      continue;
    }

    const [, name, filename] = disposition;

    if (filename) {
      files.push({
        field: name,
        filename,
        mimeType,
        buffer: Buffer.from(content, "latin1")
      });
    } else {
      fields[name] = content;
    }
  }

  if (files.length === 0) {
    throw new ApiError(400, "NO_FILES", "At least one PDF file is required.");
  }

  return { fields, files };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function getBearerToken(request) {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  return match[1];
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = resolve(publicRoot, requestedPath);
  const fallbackPath = join(publicRoot, "index.html");
  const targetPath = safePath.startsWith(publicRoot) && (await exists(safePath)) ? safePath : fallbackPath;

  if (!(await exists(targetPath))) {
    sendJson(response, 503, { error: { code: "APP_NOT_BUILT", message: "Frontend build was not found. Run npm run build first." } });
    return;
  }

  response.writeHead(200, { "Content-Type": getContentType(targetPath) });
  createReadStream(targetPath).pipe(response);
}

async function streamBlob(response, file) {
  const path = join(blobRoot, file.blobKey);

  if (!(await exists(path))) {
    throw new ApiError(404, "BLOB_NOT_FOUND", "File content was not found.");
  }

  response.writeHead(200, {
    "Content-Type": file.mimeType,
    "Content-Length": String((await stat(path)).size),
    "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`
  });
  createReadStream(path).pipe(response);
}

async function deleteBlobs(blobKeys) {
  await Promise.all(
    blobKeys.map(async (blobKey) => {
      try {
        await unlink(join(blobRoot, blobKey));
      } catch {
        return undefined;
      }
    })
  );
}

function sendJson(response, status, payload) {
  if (status === 204) {
    response.writeHead(204);
    response.end();
    return;
  }

  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  sendJson(response, status, { error: { code, message } });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function getContentType(path) {
  const extension = extname(path).toLowerCase();

  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json";

  return "application/octet-stream";
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}
