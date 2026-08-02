import { createReadStream } from "node:fs";
import { join } from "node:path";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { DataroomRole } from "@prisma/client";
import { Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { DataroomsService } from "./datarooms.service.js";

@Controller("api")
@UseGuards(AuthGuard)
export class DataroomsController {
  constructor(private readonly dataroomsService: DataroomsService) {}

  @Get("datarooms")
  async listDatarooms(@CurrentUser() user: { id: string }) {
    return { datarooms: await this.dataroomsService.listDatarooms(user.id) };
  }

  @Post("datarooms")
  async createDataroom(@CurrentUser() user: { id: string }, @Body() body: { name: string }) {
    return { dataroom: await this.dataroomsService.createDataroom(user.id, body.name) };
  }

  @Patch("datarooms/:id")
  async renameDataroom(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: { name: string }) {
    return { dataroom: await this.dataroomsService.renameDataroom(user.id, id, body.name) };
  }

  @Delete("datarooms/:id")
  async deleteDataroom(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    await this.dataroomsService.deleteDataroom(user.id, id);
  }

  @Get("datarooms/:id/items")
  async listItems(@CurrentUser() user: { id: string }, @Param("id") id: string, @Query("q") query = "") {
    return { items: await this.dataroomsService.listItems(user.id, id, query) };
  }

  @Post("datarooms/:id/folders")
  async createFolder(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: { name: string; parentId?: string | null }
  ) {
    return { item: await this.dataroomsService.createFolder(user.id, id, body.parentId ?? null, body.name) };
  }

  @Post("datarooms/:id/files")
  @UseInterceptors(FilesInterceptor("files"))
  async uploadFiles(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: { parentId?: string | null },
    @UploadedFiles() files: Array<Express.Multer.File>
  ) {
    return { items: await this.dataroomsService.uploadFiles(user.id, id, body.parentId ?? null, files ?? []) };
  }

  @Patch("items/:id")
  async renameItem(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: { name: string }) {
    return { item: await this.dataroomsService.renameItem(user.id, id, body.name) };
  }

  @Patch("items/:id/move")
  async moveItem(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: { parentId?: string | null }
  ) {
    return { item: await this.dataroomsService.moveItem(user.id, id, body.parentId ?? null) };
  }

  @Delete("items/:id")
  async deleteItem(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    await this.dataroomsService.deleteItem(user.id, id);
  }

  @Get("files/:id/content")
  async fileContent(@CurrentUser() user: { id: string }, @Param("id") id: string, @Res() response: Response) {
    const file = await this.dataroomsService.getFileForRead(user.id, id);
    const uploadDir = process.env.UPLOAD_DIR ?? "uploads";
    response.setHeader("Content-Type", file.mimeType ?? "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
    createReadStream(join(uploadDir, file.blobKey ?? "")).pipe(response);
  }

  @Get("datarooms/:id/access")
  async listAccess(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return { access: await this.dataroomsService.listAccess(user.id, id) };
  }

  @Put("datarooms/:id/public-access")
  async updatePublicAccess(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: { role: DataroomRole | null }
  ) {
    return { dataroom: await this.dataroomsService.updatePublicAccess(user.id, id, body.role) };
  }

  @Put("datarooms/:id/access/:userId")
  async updateAccess(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: { role: DataroomRole | null }
  ) {
    return { access: await this.dataroomsService.updateAccess(user.id, id, userId, body.role) };
  }
}
