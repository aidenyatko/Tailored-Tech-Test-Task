CREATE TYPE "DataroomRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
CREATE TYPE "ItemType" AS ENUM ('FOLDER', 'FILE');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token")
);

CREATE TABLE "datarooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "datarooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dataroom_access" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DataroomRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dataroom_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "ItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "blobKey" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "datarooms_ownerId_idx" ON "datarooms"("ownerId");
CREATE UNIQUE INDEX "dataroom_access_dataroomId_userId_key" ON "dataroom_access"("dataroomId", "userId");
CREATE INDEX "dataroom_access_userId_idx" ON "dataroom_access"("userId");
CREATE INDEX "items_dataroomId_idx" ON "items"("dataroomId");
CREATE INDEX "items_parentId_idx" ON "items"("parentId");
CREATE INDEX "items_blobKey_idx" ON "items"("blobKey");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "items_name_trgm_idx" ON "items" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "items_searchText_trgm_idx" ON "items" USING GIN ("searchText" gin_trgm_ops);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "datarooms" ADD CONSTRAINT "datarooms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataroom_access" ADD CONSTRAINT "dataroom_access_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "datarooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataroom_access" ADD CONSTRAINT "dataroom_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "datarooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
