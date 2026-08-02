# Architecture Decisions

## Stack Alignment

The backend was moved to NestJS, Prisma, and PostgreSQL to align with the Tailored Tech stack from the job post. The frontend keeps React 18, TypeScript, Tailwind, and now uses TanStack Query/Table with Radix/shadcn-style primitives.

## PostgreSQL as Source of Truth

IndexedDB was useful for the first MVP, but access control and shared data rooms need server-side state. PostgreSQL now stores:

- users;
- sessions;
- data rooms;
- access records;
- folder/file metadata;
- indexed PDF text.

## Prisma Migrations

The Docker startup runs `prisma migrate deploy` before starting NestJS. The first migration creates tables, relations, and trigram GIN indexes for search-friendly fields.

## Split Docker Services

Docker Compose runs three services:

- `frontend`: nginx serves the Vite build on host port `8080`;
- `backend`: NestJS runs inside the Docker network on port `8080`;
- `postgres`: PostgreSQL stores application state on host port `5438`.

The frontend service proxies `/api/*` to `backend:8080`, so the browser still uses one origin while the frontend and backend remain separately deployable containers.

## Blob Storage

PDF bytes are stored on the filesystem in a Docker volume. PostgreSQL stores the `blobKey`, metadata, and extracted text. This keeps the database lean and makes future S3-compatible storage migration straightforward.

## Search and Indexing

On upload, the backend extracts readable PDF text and stores normalized text in `items.searchText`. PostgreSQL trigram indexes are added for file names and indexed text. This gives name search and basic content search without adding a separate search engine.

Limit: scanned/image PDFs need OCR for complete content search.

## Authorization Model

Each data room has access records:

- `OWNER`: full control, including access management;
- `EDITOR`: can create, rename, move, upload, and delete items;
- `VIEWER`: can browse, search, and preview only.

The UI shows each data room with the current user's role so access is explicit.

## Public Data-room Access

The "available to everyone" option is stored as `datarooms.public_role`, not as generated access rows for every user. This makes the rule apply to future users created after the owner enables public access.

## Full-window Viewer

PDFs open in an in-app fullscreen Radix dialog with an iframe pointing to the backend file stream. The token can be passed as a query parameter because browser iframes cannot attach custom authorization headers.

## UI Direction

The layout follows familiar Google Drive patterns: sidebar, top search, breadcrumb navigation, table, details panel, access panel, and fullscreen preview. The visual language is intentionally not a brand clone: it uses a Cyberpunk 2077-inspired palette with yellow, cyan, magenta, and dark panels.

## Test Cases Workbook

Manual QA scenarios are stored in `docs/test-cases.xlsx`. The workbook covers auth, user creation, roles, direct access, public access, data rooms, folders, files, moves, search, viewer, PostgreSQL persistence, blob persistence, Docker, and CI.
