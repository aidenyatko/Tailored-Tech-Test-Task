import { Module, OnModuleInit } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { DataroomsController } from "./datarooms/datarooms.controller.js";
import { DataroomsService } from "./datarooms/datarooms.service.js";
import { PrismaService } from "./prisma.service.js";
import { UsersController } from "./users.controller.js";

@Module({
  controllers: [AuthController, DataroomsController, UsersController],
  providers: [AuthService, DataroomsService, PrismaService]
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.seedUsers();
  }
}
