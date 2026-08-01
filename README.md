# Acme Data Room

A frontend-only data room MVP for organizing due-diligence PDF documents in a browser workspace.

## What It Does

- Create multiple data rooms.
- Create folders and nested folders.
- Upload PDF files.
- Preview uploaded PDFs in the UI.
- Rename data rooms, folders, and files.
- Delete a folder with all nested folders and files.
- Search files and folders by name across the active data room.
- Persist data locally in IndexedDB.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- IndexedDB via `idb`
- Vitest and Testing Library
- Docker with Nginx for production preview
- GitHub Actions CI

## Requirements

- Node.js 22
- npm 10+
- Docker Desktop for the containerized production preview

On Windows PowerShell, use `npm.cmd` if `npm` is blocked by execution policy.

## Local Setup

```powershell
npm.cmd install
npm.cmd run dev
```

The dev server starts on `http://localhost:5173`.

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run build
```

## Production Preview

```powershell
npm.cmd run build
npm.cmd run preview
```

The preview server starts on `http://localhost:4173`.

## Docker

```powershell
docker compose down -v
docker compose up -d --build
```

The app is served on `http://localhost:8080`.

## Vercel

This repository is ready for Vercel as a static Vite app.

Recommended settings:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`

The included `vercel.json` keeps single-page app routing working by rewriting all routes to `index.html`.

## Notes

- Files are stored locally in the user's browser. They are not uploaded to a server.
- Only PDF uploads are accepted.
- Duplicate uploaded file names are renamed safely, for example `Report (1).pdf`.
- Manual rename to an existing sibling name is blocked to avoid ambiguity.

## Documentation

- [Client API](docs/API.md)
- [Architecture Decisions](docs/DECISIONS.md)
