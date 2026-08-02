import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DataroomRole, ItemType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service.js";
import { extractPdfText, normalizeSearchText } from "../files/pdf-indexer.js";

const editableRoles = [DataroomRole.OWNER, DataroomRole.EDITOR];
const readableRoles = [DataroomRole.OWNER, DataroomRole.EDITOR, DataroomRole.VIEWER];

@Injectable()
export class DataroomsService {
  private readonly uploadDir = process.env.UPLOAD_DIR ?? "uploads";

  constructor(private readonly prisma: PrismaService) {}

  async listDatarooms(userId: string) {
    const access = await this.prisma.dataroomAccess.findMany({
      where: { userId },
      include: { dataroom: { include: { owner: true } } },
      orderBy: { dataroom: { name: "asc" } }
    });

    return access.map((record) => ({
      ...record.dataroom,
      owner: publicUser(record.dataroom.owner),
      role: record.role
    }));
  }

  async createDataroom(userId: string, name: string) {
    const safeName = cleanName(name);

    return this.prisma.$transaction(async (tx) => {
      const dataroom = await tx.dataroom.create({
        data: {
          name: safeName,
          ownerId: userId
        }
      });

      await tx.dataroomAccess.create({
        data: {
          dataroomId: dataroom.id,
          userId,
          role: DataroomRole.OWNER
        }
      });

      return { ...dataroom, role: DataroomRole.OWNER };
    });
  }

  async renameDataroom(userId: string, dataroomId: string, name: string) {
    await this.requireRole(userId, dataroomId, [DataroomRole.OWNER]);

    return this.prisma.dataroom.update({
      where: { id: dataroomId },
      data: { name: cleanName(name) }
    });
  }

  async deleteDataroom(userId: string, dataroomId: string) {
    await this.requireRole(userId, dataroomId, [DataroomRole.OWNER]);
    const files = await this.prisma.item.findMany({
      where: { dataroomId, type: ItemType.FILE },
      select: { blobKey: true }
    });

    await this.prisma.dataroom.delete({ where: { id: dataroomId } });
    await Promise.all(files.map((file) => file.blobKey && this.deleteBlob(file.blobKey)));
  }

  async listItems(userId: string, dataroomId: string, query = "") {
    await this.requireRole(userId, dataroomId, readableRoles);
    const search = normalizeSearchText(query);
    const where: Prisma.ItemWhereInput = search
      ? {
          dataroomId,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { searchText: { contains: search, mode: "insensitive" } }
          ]
        }
      : { dataroomId };

    return this.prisma.item.findMany({
      where,
      orderBy: [{ type: "asc" }, { name: "asc" }]
    });
  }

  async createFolder(userId: string, dataroomId: string, parentId: string | null, name: string) {
    await this.requireRole(userId, dataroomId, editableRoles);
    await this.prepareParent(dataroomId, parentId);
    const folderName = await this.createUniqueName(dataroomId, parentId, cleanName(name));

    return this.prisma.item.create({
      data: {
        dataroomId,
        parentId,
        type: ItemType.FOLDER,
        name: folderName
      }
    });
  }

  async uploadFiles(userId: string, dataroomId: string, parentId: string | null, files: Array<Express.Multer.File>) {
    await this.requireRole(userId, dataroomId, editableRoles);
    await this.prepareParent(dataroomId, parentId);

    if (files.length === 0) {
      throw new BadRequestException("At least one PDF file is required.");
    }

    await mkdir(this.uploadDir, { recursive: true });
    const created = [];

    for (const file of files) {
      if (file.mimetype !== "application/pdf") {
        throw new BadRequestException("Only PDF files can be uploaded.");
      }

      const name = await this.createUniqueName(dataroomId, parentId, cleanName(file.originalname));
      const blobKey = `${randomUUID()}.pdf`;
      await writeFile(join(this.uploadDir, blobKey), file.buffer);
      const searchText = normalizeSearchText(`${name} ${extractPdfText(file.buffer)}`);
      const item = await this.prisma.item.create({
        data: {
          dataroomId,
          parentId,
          type: ItemType.FILE,
          name,
          mimeType: "application/pdf",
          size: file.size,
          blobKey,
          searchText
        }
      });
      created.push(item);
    }

    return created;
  }

  async renameItem(userId: string, itemId: string, name: string) {
    const item = await this.requireItem(itemId);
    await this.requireRole(userId, item.dataroomId, editableRoles);
    const nextName = await this.createUniqueName(item.dataroomId, item.parentId, cleanName(name), item.id);

    return this.prisma.item.update({
      where: { id: item.id },
      data: {
        name: nextName,
        searchText: item.type === ItemType.FILE ? normalizeSearchText(`${nextName} ${item.searchText}`) : item.searchText
      }
    });
  }

  async moveItem(userId: string, itemId: string, parentId: string | null) {
    const item = await this.requireItem(itemId);
    await this.requireRole(userId, item.dataroomId, editableRoles);

    if (parentId === item.id) {
      throw new BadRequestException("Item cannot be moved into itself.");
    }

    if (parentId) {
      const parent = await this.requireItem(parentId);

      if (parent.dataroomId !== item.dataroomId || parent.type !== ItemType.FOLDER) {
        throw new BadRequestException("Target folder was not found.");
      }

      if (item.type === ItemType.FOLDER && (await this.getDescendantIds(item.id)).includes(parent.id)) {
        throw new BadRequestException("Folder cannot be moved into its own child.");
      }
    }

    const nextName = await this.createUniqueName(item.dataroomId, parentId, item.name, item.id);

    return this.prisma.item.update({
      where: { id: item.id },
      data: { parentId, name: nextName }
    });
  }

  async deleteItem(userId: string, itemId: string) {
    const item = await this.requireItem(itemId);
    await this.requireRole(userId, item.dataroomId, editableRoles);
    const ids = item.type === ItemType.FOLDER ? [item.id, ...(await this.getDescendantIds(item.id))] : [item.id];
    const files = await this.prisma.item.findMany({
      where: { id: { in: ids }, type: ItemType.FILE },
      select: { blobKey: true }
    });

    await this.prisma.item.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(files.map((file) => file.blobKey && this.deleteBlob(file.blobKey)));
  }

  async getFileForRead(userId: string, itemId: string) {
    const item = await this.requireItem(itemId);

    if (item.type !== ItemType.FILE || !item.blobKey || !item.mimeType) {
      throw new NotFoundException("File was not found.");
    }

    await this.requireRole(userId, item.dataroomId, readableRoles);
    return item;
  }

  async listAccess(userId: string, dataroomId: string) {
    await this.requireRole(userId, dataroomId, [DataroomRole.OWNER]);

    return this.prisma.dataroomAccess.findMany({
      where: { dataroomId },
      include: { user: true },
      orderBy: { user: { name: "asc" } }
    });
  }

  async updateAccess(userId: string, dataroomId: string, targetUserId: string, role: DataroomRole | null) {
    const dataroom = await this.requireRole(userId, dataroomId, [DataroomRole.OWNER]);

    if (targetUserId === dataroom.ownerId) {
      throw new BadRequestException("Owner access cannot be changed.");
    }

    if (role === null) {
      await this.prisma.dataroomAccess.deleteMany({ where: { dataroomId, userId: targetUserId } });
      return this.listAccess(userId, dataroomId);
    }

    if (role === DataroomRole.OWNER) {
      throw new BadRequestException("Use editor or viewer role.");
    }

    await this.prisma.dataroomAccess.upsert({
      where: { dataroomId_userId: { dataroomId, userId: targetUserId } },
      create: { dataroomId, userId: targetUserId, role },
      update: { role }
    });

    return this.listAccess(userId, dataroomId);
  }

  private async requireRole(userId: string, dataroomId: string, roles: DataroomRole[]) {
    const access = await this.prisma.dataroomAccess.findUnique({
      where: { dataroomId_userId: { dataroomId, userId } },
      include: { dataroom: true }
    });

    if (!access || !roles.includes(access.role)) {
      throw new ForbiddenException("You do not have access to this data room.");
    }

    return access.dataroom;
  }

  private async requireItem(itemId: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });

    if (!item) {
      throw new NotFoundException("Item was not found.");
    }

    return item;
  }

  private async prepareParent(dataroomId: string, parentId: string | null) {
    if (!parentId) {
      return;
    }

    const parent = await this.requireItem(parentId);

    if (parent.dataroomId !== dataroomId || parent.type !== ItemType.FOLDER) {
      throw new BadRequestException("Parent folder was not found.");
    }
  }

  private async createUniqueName(dataroomId: string, parentId: string | null, name: string, exceptId?: string) {
    const siblings = await this.prisma.item.findMany({
      where: { dataroomId, parentId, id: exceptId ? { not: exceptId } : undefined },
      select: { name: true }
    });
    const existing = siblings.map((item) => item.name.toLowerCase());

    if (!existing.includes(name.toLowerCase())) {
      return name;
    }

    const dotIndex = name.lastIndexOf(".");
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
    let counter = 1;
    let candidate = `${base} (${counter})${extension}`;

    while (existing.includes(candidate.toLowerCase())) {
      counter += 1;
      candidate = `${base} (${counter})${extension}`;
    }

    return candidate;
  }

  private async getDescendantIds(folderId: string) {
    const result: string[] = [];
    const queue = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      const children = await this.prisma.item.findMany({ where: { parentId: currentId } });

      for (const child of children) {
        result.push(child.id);

        if (child.type === ItemType.FOLDER) {
          queue.push(child.id);
        }
      }
    }

    return result;
  }

  private async deleteBlob(blobKey: string) {
    try {
      await unlink(join(this.uploadDir, blobKey));
    } catch {
      return;
    }
  }
}

function cleanName(value: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");

  if (!name) {
    throw new BadRequestException("Name is required.");
  }

  if (name.length > 120) {
    throw new BadRequestException("Name must be 120 characters or fewer.");
  }

  return name;
}

function publicUser(user: { id: string; email: string; name: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}
