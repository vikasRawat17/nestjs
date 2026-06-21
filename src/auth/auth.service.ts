import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { SignUpDto } from './dto/sign-up.dto';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { SessionsService } from 'src/sessions/sessions.service';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { LoginDto } from './dto/login.dto';

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
    const accessToken = await this.signAccessToken(user);
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
  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid Credentials');
    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid Credentials');
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Please Verify your email before logging in ',
      );
    const { accessToken, refreshToken } = await this.issueSession(
      { id: user.id, email: user.email },
      userAgent,
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
  private signAccessToken(user: { id: string; email: string }) {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SEC },
    );
  }
  async refresh(rawRefreshToken: string, userAgent?: string) {
    const tokenHash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    const session = await this.sessionService.findByTokenHash(tokenHash);
    if (!session) throw new UnauthorizedException('Invalid session');
    if (session.expiresAt < new Date()) {
      await this.sessionService.deleteByTokenHash(tokenHash);
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.userService.findById(session.userId);
    if (!user) throw new UnauthorizedException('Invalid session');

    const newRefreshToken = randomBytes(32).toString('hex');
    const newTokenHash = createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');
    const newExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
    await this.sessionService.rotateSession(
      session.id,
      newTokenHash,
      newExpiresAt,
      userAgent,
    );
    const accessToken = await this.signAccessToken({
      id: user.id,
      email: user.email,
    });
    return { accessToken, refreshToken: newRefreshToken };
  }
  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);

      await this.userService.setResetToken(user.id, tokenHash, expiry);
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    }
    return {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };
  }
  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = createHash('sha2565').update(rawToken).digest('hex');

    const user = await this.userService.findByResetToken(tokenHash);
    if (!user) throw new BadGatewayException('Invalid or expired reset link');
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new BadGatewayException('Invalid or expired reset link');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userService.resetPassword(user.id, hashedPassword);
    await this.sessionService.deleteAllForUser(user.id);
    return { message: 'Passowrd updated.Please login again' };
  }
}
