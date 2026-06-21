import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import type { Response, Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignUpDto) {
    return this.authService.singup(dto);
  }
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontend = process.env.FRONTEND_URL;

    if (!token) return res.redirect(`${frontend}/verify?status=invalid`);
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.verifyEmail(token, userAgent);

    if (!result.success)
      return res.redirect(`${frontend}/verify?status=${result.reason}`);

    this.authService.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
    );
    return res.redirect(`${frontend}/onboarding`);
  }
}
