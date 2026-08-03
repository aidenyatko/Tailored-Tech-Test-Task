# Architecture Decisions

This document explains the main product and engineering decisions made during the data room implementation. It is written as a developer diary: what was chosen, why it was chosen, how it was implemented, and what trade-offs remain.

## Product Shape

The task was implemented as a Google Drive-like data room for PDF due-diligence workflows.

The product goal is not just local file storage. The useful workflow is:

- a user signs in;
- the user sees only data rooms available to them;
- an owner can manage access;
- editors can work with folders and PDF files;
- viewers can browse, search, and preview;
- PDF content is indexed for search;
- the app runs with one Docker Compose command.

This shaped the architecture. A browser-only IndexedDB app would be simpler, but it cannot safely model shared access, ownership, public access, server-side search, or persistent blob metadata between users.

## Stack Choice

The application uses NestJS, Prisma, PostgreSQL, React 18, TypeScript, Tailwind, TanStack Query, TanStack Table, and Radix-style primitives.

Why:

- NestJS gives a structured backend with controllers, services, guards, dependency injection, and testable modules.
- Prisma gives typed database access and explicit migrations.
- PostgreSQL is a good default for relational access rules, folder/file metadata, sessions, and indexed text.
- React with TanStack Query keeps server state explicit and avoids hand-written fetch/cache logic across the UI.
- TanStack Table makes table rendering easier to extend with real sorting and later pagination.
- Radix primitives provide accessible dialogs and select controls without building low-level behavior by hand.

This stack is a good fit globally because the app has two connected responsibilities: a transactional backend with access rules and a dense browser UI with server-driven data. NestJS and PostgreSQL keep permissions, sessions, and file metadata centralized on the server. React and TanStack Query keep the interface responsive without duplicating backend state by hand.

How:

- Auth logic lives in `server/src/auth`.
- Data room, item, access, upload, move, and file streaming logic lives in `server/src/datarooms`.
- Prisma schema and migrations live in `prisma`.
- Frontend API calls live in `src/api`.
- The main UI surface lives in `src/App.tsx`.

Trade-off:

The app is still intentionally MVP-sized. It uses the selected stack, but does not split every area into many modules or add enterprise-level abstractions before they are needed.

## PostgreSQL as Source of Truth

PostgreSQL stores the application state:

- users;
- sessions;
- data rooms;
- access records;
- public data-room access role;
- folder and file metadata;
- PDF blob keys;
- indexed PDF text.

Why:

Access control is relational. A user can have many data rooms, a data room can have many users, each user can have one role per data room, and the owner must be protected from accidental removal. PostgreSQL handles these relationships directly.

How:

- `users` stores login identity and password hash.
- `sessions` stores bearer tokens for the demo auth flow.
- `datarooms` stores ownership and optional `public_role`.
- `dataroom_access` stores direct user-to-room roles.
- `items` stores folders and files in a self-referencing tree.

Trade-off:

Search is stored in PostgreSQL text fields instead of a separate search engine. This is enough for the test task and keeps the system deployable with one database, but production-scale search could later move to OpenSearch, Meilisearch, or PostgreSQL full-text search with language dictionaries.

## Prisma Migrations

Database schema changes are managed through Prisma migrations.

Why:

The app must start consistently in Docker and CI. A migration history makes the database reproducible and reviewable.

How:

- The initial migration creates users, sessions, data rooms, access records, item metadata, and indexes.
- The public access migration adds `datarooms.public_role`.
- Docker backend startup runs `prisma migrate deploy` before starting NestJS.

Trade-off:

The migration process is simple and production-like, but there is no separate migration job container. For this test task, running migrations before backend start is acceptable because there is one backend container.

## Split Docker Services

Docker Compose runs separate services:

- `frontend`: nginx serves the Vite build on host port `8080`;
- `backend`: NestJS runs inside the Docker network on port `8080`;
- `postgres`: PostgreSQL stores application data on host port `5438`.

Why:

Frontend and backend should be independently deployable. A single all-in-one container would be quicker at first, but it would hide deployment boundaries and make the architecture less realistic.

How:

- `Dockerfile.frontend` builds Vite and serves static files through nginx.
- `Dockerfile.backend` builds the NestJS backend and runs migrations before app start.
- `nginx.conf` proxies `/api/*` from the frontend service to `backend:8080`.

Trade-off:

The browser still talks to one origin, `http://localhost:8080`, because nginx proxies API requests. This avoids CORS complexity while keeping Docker services split internally.

## Vercel Demo Hosting

The task recommends Vercel for the hosted URL. The repository keeps the full-stack Docker/NestJS/PostgreSQL implementation as the main product, and Vercel is used as a public frontend demo with mocked browser data.

Why:

Vercel is strongest when the application is a static frontend, a Next.js application, or serverless API functions. This project is intentionally shaped as a complete data-room system with a dedicated backend, relational database, and blob storage. The backend is not just a thin mock API: it owns authentication, authorization, folder/file mutations, PDF upload handling, file streaming, text indexing, and Prisma migrations.

Using Vercel alone would leave several important parts outside the platform:

- PostgreSQL needs a managed database provider;
- uploaded PDF blobs need persistent object storage;
- NestJS needs a stable backend runtime;
- Prisma migrations need a controlled deployment step;
- file streaming should remain behind backend authorization checks.

How the submitted hosting is split:

- GitHub contains the full implementation;
- Docker Compose runs the real end-to-end system locally;
- Vercel runs the frontend with `VITE_DEMO_MODE=mock`;
- mock mode keeps data in browser storage and demonstrates the UX without external services.

How this should be hosted in production:

- frontend on Vercel;
- backend on Render, Railway, Fly.io, or another Node.js service host;
- PostgreSQL on Neon, Supabase, Railway, or another managed Postgres provider;
- PDF blobs in S3-compatible storage;
- environment variables shared between frontend and backend for API routing and auth configuration.

Why environment variables control the mode:

The same frontend code can run against either the real API or the mock browser backend. `VITE_DEMO_MODE=api` keeps the Docker/full-stack behavior. `VITE_DEMO_MODE=mock` switches the deployed Vercel build to local demo data. This avoids maintaining a separate Vercel-only application.

Why Docker Compose is still used for the full-stack submission:

Docker Compose keeps the whole system reproducible from one command. It starts the frontend, backend, PostgreSQL, migrations, seeded demo users, and local blob volume together. That makes review easier because the evaluator can run the complete end-to-end product locally without wiring several external services first.

Trade-off:

The Vercel URL is a demo surface, not the complete backend deployment. The benefit is speed and reviewability: the UX is publicly accessible, while the real backend, database, migrations, and blob behavior remain verifiable through Docker Compose. If a production public version is required, the architecture is ready to split across Vercel plus managed backend/database/blob providers.

## Authentication

Authentication is email/password with server-side sessions.

Why:

The task needs understandable access control and a way to create users from the login screen. A full OAuth or enterprise SSO setup would be too heavy for the scope.

How:

- Demo users are seeded when the database is empty.
- Passwords are hashed before storage.
- Login returns a bearer token.
- `/api/auth/me` returns the current user.
- `/api/auth/register` creates a new user and returns a session.

Trade-off:

This is demo-grade authentication. A production system should add password reset, stronger password policy, rate limiting, refresh tokens or signed cookies, audit logs, and possibly SSO.

## Authorization Model

Authorization is role-based per data room.

Roles:

- `OWNER`: full control, including access management and data room deletion;
- `EDITOR`: can create, upload, rename, move, and delete folders/files;
- `VIEWER`: can browse, search, preview, and open files only.

Why:

These three roles are enough to model the expected data room workflow without overcomplicating the UI.

How:

- `dataroom_access` stores direct user access.
- Backend service methods call `requireRole(...)` before reading or mutating room data.
- The frontend disables write controls when the current role is not `OWNER` or `EDITOR`.
- The owner access record cannot be removed or reassigned through the access endpoint.

Trade-off:

The UI disables unavailable actions for usability, but backend checks remain the real security boundary.

## Public Data-room Access

The "available to everyone" option is stored as `datarooms.public_role`, not as generated access rows for every user.

Why:

If the owner marks a data room as available to everyone, the rule should also apply to users created later. Creating access rows only for existing users would make future users silently miss that data room.

How:

- `publicRole` was added to the Prisma `Dataroom` model.
- `listDatarooms(...)` returns both direct-access rooms and public rooms.
- Direct access wins when a user has both direct and public access.
- `requireRole(...)` checks direct access first, then public access.
- Public access can be `VIEWER`, `EDITOR`, or `null`.
- Public `OWNER` is rejected.

Trade-off:

Public access is simple and effective, but it is global. A production system might add organization/team scopes instead of "everyone in the whole app".

## Access Management UI

Access management belongs to the currently selected data room.

Why:

Access is not a global application setting. It is always tied to one data room, so the UI keeps the selected data room as the target and shows its access state in the right panel.

How:

- Owners can open access management for the selected data room.
- The access dialog shows:
  - public access selector;
  - search by user name/email;
  - per-user role selectors.
- The right panel shows the current public/direct access state.

Trade-off:

Radix Select is used for role selection. It behaves well in browsers, but jsdom tests needed browser API shims for pointer and scroll methods.

## Blob Storage

PDF bytes are stored on the filesystem in a Docker volume. PostgreSQL stores only metadata and the `blobKey`.

Why:

Storing binary PDFs directly in PostgreSQL would make the database heavier and less realistic for future cloud storage. File storage plus metadata is a practical middle ground.

How:

- Uploaded files are written to `UPLOAD_DIR`.
- Docker mounts `upload-data` to `/app/uploads`.
- Each PDF gets a generated blob key.
- File content is streamed by `/api/files/:id/content`.

Trade-off:

Local volume storage is fine for the test task. Production should move blobs to S3-compatible storage, add virus scanning, object-level permissions, and signed URLs or a streaming proxy with stricter token handling.

## PDF Upload and Sanitized Indexing

PDF upload accepts only `application/pdf` files and indexes readable text.

Why:

The core task is a PDF data room. Searching by filename only is not enough, so upload also tries to extract searchable PDF content.

How:

- Multer receives uploaded files in memory.
- The backend rejects non-PDF files.
- The backend writes valid PDFs to blob storage.
- `extractPdfText(...)` extracts simple readable PDF strings and bytes.
- `normalizeSearchText(...)` lowercases and normalizes whitespace.
- Control characters, including NUL bytes, are removed before saving text to PostgreSQL.

Why NUL-byte sanitizing was added:

Some real PDF files contained `0x00` characters in extracted text. PostgreSQL text fields reject NUL bytes, so the indexer sanitizes text before database writes.

Trade-off:

The indexer is lightweight. It works for readable PDFs, including the provided sample PDFs, but scanned/image-only PDFs still require OCR.

## Search

Search checks both item names and indexed PDF text.

Why:

Users naturally expect search to find both a file name and content inside a PDF.

How:

- Upload stores normalized text in `items.searchText`.
- The list endpoint accepts `?q=...`.
- The backend filters by item name or indexed text.
- The frontend top search calls the backend list endpoint with the query.

Trade-off:

The current search is deliberately simple. Ranking, snippets, typo tolerance, phrase search, and OCR are out of scope for the MVP.

## Folder and File Tree

Folders and files share one `items` table with a `type` field and `parentId`.

Why:

Folders and files live in the same hierarchy. A shared table makes moving, listing, deleting descendants, and rendering breadcrumbs simpler.

How:

- `ItemType.FOLDER` represents folders.
- `ItemType.FILE` represents PDFs.
- `parentId` points to another item.
- `moveItem(...)` prevents moving a folder into itself or its descendant.
- Deleting a folder deletes its descendants and stored blobs.

Trade-off:

Tree operations are implemented in application code. For very large trees, recursive SQL queries or a closure table could be better.

## Filters and Sorting

The file table includes working filters and sorting.

Why:

Non-working UI controls are worse than missing controls. The UI should only show interactions that do something real.

How:

- The sidebar stays focused on data rooms and creation.
- The UI avoids inactive view toggle buttons.
- `Type` filter:
  - all;
  - folders;
  - PDF files.
- `Modified` filter:
  - any time;
  - today;
  - last 7 days;
  - last 30 days.
- Table headers now sort by:
  - name;
  - owner;
  - modification date;
  - file size.

Trade-off:

Sorting and filtering currently happen on the already loaded client-side item list. For very large data rooms, these should move to backend query parameters with pagination.

## Full-window Viewer

PDFs open in an in-app fullscreen Radix dialog with an iframe pointing to the backend file stream.

Why:

The viewer is part of the data-room workflow. It keeps the user inside the application while still giving the PDF enough space for reading.

How:

- Selecting a PDF shows metadata and preview in the right panel.
- `Open in viewer` opens a fullscreen dialog.
- The iframe uses `/api/files/:id/content?token=...`.

Trade-off:

The token is passed in the query string because iframe requests cannot attach custom authorization headers. Production should avoid long-lived query tokens and prefer short-lived signed file access tokens.

## UI Direction

The layout follows familiar Google Drive patterns while keeping the app's cyberpunk theme.

Why:

The layout follows a familiar file-manager model because users already understand sidebars, breadcrumbs, table rows, and details panels. The color direction is Cyberpunk 2077-inspired because it was a playful product choice for this project: the familiar structure stays easy to use, while the visual style feels less generic than a plain Google Drive clone.

How:

- Left sidebar contains creation and data rooms only.
- Top bar contains global data-room search.
- Main content uses breadcrumbs: data room -> folders -> file.
- Folder navigation has a back button.
- Right panel shows role, current access, and selected-file metadata.
- Styling uses a Cyberpunk 2077-inspired palette and rounded corners.

Trade-off:

The app borrows interaction patterns, not brand assets. It is intentionally not a pixel-perfect clone of Google Drive.

## Test Data

Real PDF fixtures are stored in `test-assets/resumes`.

Why:

Real PDF fixtures are useful because they contain the kind of binary structure and extracted text artifacts that small artificial files often miss. They make upload and indexing checks closer to real use.

How:

- Six sample PDFs are included:
  - backend;
  - full-stack;
  - JavaScript;
  - Node.js;
  - Python;
  - web.
- Manual test cases reference these files.
- Browser QA uploaded all six through the UI file picker.

Trade-off:

The repository becomes larger because binary fixtures are committed. The benefit is realistic repeatable upload testing.

## Testing Strategy

Testing is layered.

Automated checks:

- TypeScript typecheck;
- ESLint;
- Vitest unit tests;
- React UI tests;
- production build;
- GitHub Actions CI.

Manual checks:

- clean Docker startup with migrations;
- API upload of all sample PDFs;
- browser UI walkthrough:
  - login;
  - user creation;
  - data room creation;
  - folder creation;
  - access management;
  - user search in access dialog;
  - public access;
  - PDF upload;
  - filters;
  - sorting;
  - fullscreen viewer.

Why:

Automated tests catch regressions quickly. Manual browser checks catch integration and layout issues that unit tests often miss.

## AI Usage

AI was used as a development assistant during the task, not as an unchecked replacement for engineering ownership.

Where AI helped:

- breaking the requirements into smaller implementation steps;
- drafting parts of the React and NestJS code;
- suggesting edge cases for folders, files, access roles, upload, search, and filtering;
- drafting documentation structure for README, API notes, decisions, and manual test cases;
- helping investigate failures during PDF upload and text indexing;
- supporting manual QA planning before browser walkthroughs.

How the output was controlled:

- architecture choices were reviewed against the actual product requirements;
- generated code was inspected and adjusted to fit the existing project structure;
- backend behavior was validated with automated tests and API checks;
- frontend behavior was validated with browser walkthroughs;
- documentation was rewritten to match the implemented product instead of leaving generic AI wording;
- final GitFlow steps were gated by GitHub Actions on feature branches, `dev`, and `master`.

Why this approach:

The task explicitly allowed AI usage. The useful part of AI here was speed: it helped produce drafts, alternatives, and checklists faster. The important engineering work was still deciding which suggestions fit the MVP, removing weak or non-working ideas, testing the result, and documenting the final behavior clearly.

Trade-off:

AI can produce plausible but incorrect implementation details, so it was not treated as a source of truth. The source of truth is the running application, automated checks, manual browser verification, and the code committed to the repository.

## CI and GitFlow

The repository uses a GitFlow-like workflow:

- feature branch;
- local validation;
- push feature branch;
- CI on feature branch;
- merge into `dev`;
- CI on `dev`;
- merge into `master`;
- CI on `master`.

Why:

This gives clear checkpoints and keeps `master` as the final stable branch.

How:

- GitHub Actions runs lint, typecheck, tests, and build.
- CI runs for `master`, `dev`, `feature/**`, `fix/**`, and `codex/**`.
- `codex/**` was added because Codex-created branches use that prefix.

Trade-off:

This is an imitation of PR flow through merge commits, not a full protected-branch setup. Production should use required checks and branch protection rules.

## Known Limits and Future Improvements

Important remaining limits:

- Auth is demo-grade.
- Search has no OCR.
- File tokens in iframe URLs should become short-lived signed tokens.
- No audit log for access changes.
- No pagination for large folders.
- No drag-and-drop upload yet.
- No team/organization-level access groups.
- No cloud blob storage.
- No virus scanning for uploaded files.

These were left out because the test task needed a focused full-stack MVP, not a full enterprise data room platform.
