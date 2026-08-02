import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthService } from "./auth/auth.service.js";
import { PrismaService } from "./prisma.service.js";

@Controller("api/users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { name: "asc" } });
    return { users: users.map((user) => this.authService.publicUser(user)) };
  }
}
