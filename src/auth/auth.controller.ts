import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import type { Response, Request } from 'express';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto,
      userAgent,
    );

    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return { user };
  }
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.refresh_token as string;
    if (!rawRefreshToken) throw new UnauthorizedException('No refresh Token');
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.refresh(
      rawRefreshToken,
      userAgent,
    );
    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return { success: true };
  }
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
  @Post('reset-password')
  resetPasswprd(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
