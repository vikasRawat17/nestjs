import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import type { Response, Request } from 'express';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  clearAuthCookies,
  setAuthCookies,
} from 'src/utils/helpers/auth/auth.helpers';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: { id: string; email: string }) {
    return { user };
  }

  @Post('signup')
  signup(@Body() dto: SignUpDto) {
    return this.authService.signup(dto);
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

    setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.redirect(`${frontend}/onboarding`);
  }
  @Throttle({ default: { ttl: 60000, limit: 5 } })
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

    setAuthCookies(res, accessToken, refreshToken);
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
    setAuthCookies(res, accessToken, refreshToken);
    return { success: true };
  }
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.refresh_token as string);
    clearAuthCookies(res);
    return { success: true };
  }
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: { id: string; email: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);
    clearAuthCookies(res);
    return { success: true };
  }
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }
}
