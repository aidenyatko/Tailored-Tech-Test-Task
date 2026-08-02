import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import express, { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpAdapter().getInstance();
  const publicRoot = process.env.PUBLIC_ROOT ?? join(process.cwd(), "dist");

  app.enableCors();

  if (existsSync(publicRoot)) {
    server.use(express.static(publicRoot));
    server.get("*", (request: Request, response: Response, next: NextFunction) => {
      if (request.path.startsWith("/api")) {
        next();
        return;
      }

      response.sendFile(join(publicRoot, "index.html"));
    });
  }

  await app.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
}

void bootstrap();
