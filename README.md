# Tailored Tech Data Room

Cyberpunk-themed data room MVP for due-diligence PDF workflows.

The implementation follows the Tailored Tech job stack direction:

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
- Owner access management per data room through the data-room context menu.
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
- Real PDF resume fixtures for upload testing: `test-assets/resumes`.

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

## Manual Test Cases

See [docs/test-cases.xlsx](docs/test-cases.xlsx).

## Upload Test Files

Use PDFs from [test-assets/resumes](test-assets/resumes) for manual upload checks. The primary resume is `Dmytro_Kiselov_Full-Stack_Developer.pdf`.

## Notes

- PDF text extraction is intentionally lightweight. It indexes simple text operands and readable PDF bytes. Scanned/image-only PDFs require OCR for full production-grade search.
- Blob storage is local filesystem storage mounted as a Docker volume. It can be swapped for S3-compatible storage later.
- Authentication is demo-grade and suitable for the test task, not a complete production identity system.
