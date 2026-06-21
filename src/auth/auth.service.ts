import { ConflictException, Injectable } from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { SignUpDto } from './dto/sign-up.dto';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { SessionsService } from 'src/sessions/sessions.service';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly mailService: MailService,
    private readonly sessionService: SessionsService,
    private readonly jwtService: JwtService,
  ) {}

  async singup(dto: SignUpDto) {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const hashPassword = await bcrypt.hash(dto.password, 12);

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.userService.createUser({
      name: dto.name,
      email: dto.email,
      password: hashPassword,
      verificationToken: tokenHash,
      verificationTokenExpiry: expiry,
    });

    await this.mailService.sendVerificationEmail(dto.email, rawToken);

    return { message: 'Check your email to verify account ' };
  }
  private async issueSession(
    user: { id: string; email: string },
    userAgent?: string,
  ) {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SEC },
    );
    const refreshToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.sessionService.createSession({
      userId: user.id,
      tokenHash,
      userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    });
    return { accessToken, refreshToken };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const common = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      domain: process.env.COOKIE_DOMAIN,
    };

    res.cookie('access_token', accessToken, {
      ...common,
      path: '/',
      maxAge: ACCESS_TTL_SEC * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      ...common,
      path: '/auth',
      maxAge: REFRESH_TTL_SEC * 1000,
    });
  }

  async verifyEmail(rawToken: string, userAgent?: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const user = await this.userService.findByVerificationToken(tokenHash);
    if (!user) return { success: false as const, reason: 'invalid' as const };
    if (
      !user.verificationTokenExpiry ||
      user.verificationTokenExpiry < new Date()
    ) {
      return { success: false as const, reason: 'expired' as const };
    }
    await this.userService.markEmailVerified(user.id);

    const { accessToken, refreshToken } = await this.issueSession(
      { id: user.id, email: user.email },
      userAgent,
    );
    return { success: true as const, accessToken, refreshToken };
  }
}
