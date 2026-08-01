# Architecture Decisions

## Frontend-Only MVP

The task allows mocked CRUD storage, so the MVP is a React SPA with local IndexedDB persistence. This keeps setup simple and lets reviewers run the full product without database credentials or a backend server.

## IndexedDB Storage

IndexedDB was chosen over `localStorage` because uploaded PDF files can be large binary objects. Metadata and file bytes are separated:

- `datarooms`: top-level workspaces.
- `items`: folders and files.
- `blobs`: PDF bytes referenced by `FileItem.storageKey`.

The app stores PDF bytes as `ArrayBuffer` and rebuilds a `Blob` for preview. This is predictable in browsers and easier to test than storing `File` instances directly.

## Tree Model

Folders and files are stored as flat records with `parentId`. Root-level items use `parentId: null`.

This makes common operations straightforward:

- list current folder by filtering `parentId`;
- build breadcrumbs by walking parents;
- delete a folder by collecting descendant ids;
- search across the full active data room.

## Name Handling

The app prevents ambiguous sibling names. Manual rename returns a validation error on duplicates, while creation and upload generate safe suffixes. That gives a smooth upload flow without silently overwriting files.

## PDF-Only Uploads

The MVP accepts only `application/pdf`, matching the functional requirement. Other file types are rejected before persistence.

## No Authentication

Authentication is optional in the task. It is intentionally out of scope for this MVP so the core document management workflow is complete and easy to review.

## Deployment

The app is prepared for Vercel as a static Vite deployment. Docker is included for local production validation with Nginx.

## Testing Strategy

The test suite focuses on the riskiest behavior:

- domain name normalization and duplicate handling;
- tree traversal and cascade deletion;
- IndexedDB storage rules;
- React user flows for create, upload, search, preview, and delete.
