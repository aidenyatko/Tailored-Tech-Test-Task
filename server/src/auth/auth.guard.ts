import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization ?? "";
    const tokenFromHeader = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    const token = tokenFromHeader ?? request.query.token;

    if (!token || typeof token !== "string") {
      throw new UnauthorizedException("Authentication is required.");
    }

    request.user = await this.authService.userFromToken(token);
    return true;
  }
}
