# Tailored Tech Data Room

Cyberpunk-themed data room MVP for due-diligence PDF workflows.

The implementation uses a practical full-stack JavaScript architecture:

- React 18 + TypeScript
- TanStack Query and TanStack Table
- Radix/shadcn-style UI primitives
- Tailwind CSS
- NestJS
- Prisma + PostgreSQL
- ts-rest contract definitions
- Vitest
- Docker Compose

## Features

- Email/password demo authentication with user creation from the login screen.
- Data rooms visible only to users with access.
- Owner, editor, and viewer roles with direct or public data-room access.
- Owner access management per selected data room.
- Create, rename, and delete data rooms.
- Create nested folders.
- Upload PDF files into blob storage.
- Store metadata, roles, sessions, and file index data in PostgreSQL.
- Rename, delete, and move folders/files.
- Preview PDF files in the details panel.
- Open PDFs in a full-window in-app viewer.
- Search by file/folder name and indexed PDF text.
- Cyberpunk 2077-inspired color system over a Google Drive-like workspace layout.
- Test cases workbook: `docs/test-cases.xlsx`.
- Real PDF fixtures for upload testing: `test-assets/resumes`.

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Owner | `owner@acme.test` | `owner123` |
| Editor | `editor@acme.test` | `editor123` |
| Viewer | `viewer@acme.test` | `viewer123` |

## One-command Run

```powershell
docker compose up -d --build
```

Open:

```text
http://localhost:8080
```

The command starts:

- PostgreSQL on host port `5438`
- NestJS API in the internal `backend` service
- nginx static frontend on host port `8080`
- `/api/*` proxying from `frontend` to `backend`
- Prisma migrations in the `backend` service
- default demo-user seeding

Stop and remove containers/volumes:

```powershell
docker compose down -v
```

## Environment

Copy [.env.example](.env.example) to `.env` when you want to override defaults.

Important variables:

- `VITE_DEMO_MODE=api` uses the real NestJS/PostgreSQL backend.
- `VITE_DEMO_MODE=mock` uses the in-browser mock backend for Vercel/static hosting.
- `VITE_DEFAULT_LOGIN_EMAIL`, `VITE_DEFAULT_LOGIN_PASSWORD`, and `VITE_DEMO_ACCOUNTS_TEXT` control the login screen defaults.
- `BACKEND_DATABASE_URL`, `UPLOAD_DIR`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` control the Docker backend/database setup.

## Hosted URL

The GitHub repository contains the full-stack implementation with NestJS, PostgreSQL, Prisma migrations, and blob storage. The Vercel deployment is intended as a public frontend demo and should run with mocked browser data.

Set this Vercel environment variable:

```text
VITE_DEMO_MODE=mock
```

Vercel build settings:

```text
Build Command: npm run frontend:build
Output Directory: dist
Install Command: npm ci
```

Why:

- the app is not only a static frontend; it includes a NestJS backend;
- PostgreSQL is required for users, sessions, roles, folders, file metadata, and search index data;
- PDF blobs need persistent storage;
- the backend runs Prisma migrations before startup;
- Docker Compose gives a reproducible end-to-end environment with frontend, backend, database, and blob volume in one command;
- Vercel gives a convenient public URL for UX review when the app runs in `mock` mode.

For production, the app should be split: frontend on Vercel, backend on Render/Railway/Fly.io, PostgreSQL on Neon/Supabase/Railway, and PDF blobs in S3-compatible storage. For the test task, Docker Compose is kept as the clearest way to verify the complete backend system locally, while Vercel can host the mock-data demo.

## Local Checks

On Windows PowerShell, use `npm.cmd` if `npm` is blocked by execution policy.

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build
```

## API

See [docs/API.md](docs/API.md).

## Decisions

See [docs/DECISIONS.md](docs/DECISIONS.md).

The decisions document also includes an `AI Usage` section that explains where AI helped during the work and which parts were still reviewed, selected, and validated manually.

## Manual Test Cases

See [docs/test-cases.xlsx](docs/test-cases.xlsx).

## Upload Test Files

Use PDFs from [test-assets/resumes](test-assets/resumes) for manual upload checks. The primary sample file is `Dmytro_Kiselov_Full-Stack_Developer.pdf`.

## Notes

- PDF text extraction is intentionally lightweight. It indexes simple text operands and readable PDF bytes. Scanned/image-only PDFs require OCR for full production-grade search.
- Blob storage is local filesystem storage mounted as a Docker volume. It can be swapped for S3-compatible storage later.
- Authentication is demo-grade and suitable for the test task, not a complete production identity system.
