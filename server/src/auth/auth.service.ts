import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { hashPassword, verifyPassword } from "./password.js";

const DEFAULT_USERS = [
  { email: "owner@acme.test", name: "Olivia Owner", password: "owner123" },
  { email: "editor@acme.test", name: "Evan Editor", password: "editor123" },
  { email: "viewer@acme.test", name: "Val Viewer", password: "viewer123" }
];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async seedUsers() {
    const count = await this.prisma.user.count();

    if (count > 0) {
      return;
    }

    await this.prisma.user.createMany({
      data: DEFAULT_USERS.map((user) => ({
        email: user.email,
        name: user.name,
        passwordHash: hashPassword(user.password)
      }))
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const session = await this.prisma.session.create({
      data: {
        token: randomUUID(),
        userId: user.id
      }
    });

    return {
      token: session.token,
      user: this.publicUser(user)
    };
  }

  async userFromToken(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!session) {
      throw new UnauthorizedException("Authentication is required.");
    }

    return session.user;
  }

  publicUser(user: { id: string; email: string; name: string }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name
    };
  }
}
