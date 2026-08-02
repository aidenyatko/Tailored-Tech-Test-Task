# API Documentation

Base URL:

```text
/api
```

Most routes require:

```text
Authorization: Bearer <token>
```

PDF content can also be opened in an iframe with:

```text
/api/files/:id/content?token=<token>
```

## Auth

### POST `/auth/login`

Request:

```json
{
  "email": "owner@acme.test",
  "password": "owner123"
}
```

Response:

```json
{
  "token": "session-token",
  "user": {
    "id": "user-id",
    "email": "owner@acme.test",
    "name": "Olivia Owner"
  }
}
```

### GET `/auth/me`

Returns the current authenticated user.

## Users

### GET `/users`

Returns demo users for the owner access-management UI.

## Data Rooms

### GET `/datarooms`

Returns only data rooms where the current user has access.

Each data room includes the current user's role:

- `OWNER`
- `EDITOR`
- `VIEWER`

### POST `/datarooms`

Creates a data room. The creator becomes `OWNER`.

### PATCH `/datarooms/:id`

Renames a data room. Owner only.

### DELETE `/datarooms/:id`

Deletes a data room, its items, access records, and blobs. Owner only.

## Items

### GET `/datarooms/:id/items`

Returns folders and files for one data room.

Optional query:

```text
?q=revenue
```

Search checks names and indexed PDF text.

### POST `/datarooms/:id/folders`

Creates a folder.

Request:

```json
{
  "parentId": null,
  "name": "Legal"
}
```

Owner/editor only.

### POST `/datarooms/:id/files`

Uploads PDF files as `multipart/form-data`.

Fields:

- `parentId`: optional folder id
- `files`: one or more PDF files

Owner/editor only.

### PATCH `/items/:id`

Renames a folder or file.

### PATCH `/items/:id/move`

Moves a folder or file.

Request:

```json
{
  "parentId": "target-folder-id"
}
```

Use `null` to move to root.

### DELETE `/items/:id`

Deletes a file or cascades a folder delete.

## File Content

### GET `/files/:id/content`

Streams a PDF file inline if the user has access to the data room.

## Access

### GET `/datarooms/:id/access`

Returns access records. Owner only.

### PUT `/datarooms/:id/access/:userId`

Sets or removes access. Owner only.

Request:

```json
{
  "role": "VIEWER"
}
```

Allowed values:

- `EDITOR`
- `VIEWER`
- `null` to remove access

Owner role cannot be removed or reassigned through this endpoint.
