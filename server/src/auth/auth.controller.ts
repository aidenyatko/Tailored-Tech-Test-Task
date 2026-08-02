import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: { id: string; email: string; name: string }) {
    return { user: this.authService.publicUser(user) };
  }
}
