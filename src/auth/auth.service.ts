import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { SignUpDto } from './dto/sign-up.dto';
import * as bcrypt from 'bcrypt';
import { SessionsService } from 'src/sessions/sessions.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import {
  ACCESS_TTL_SEC,
  BCRYPT_ROUNDS,
  REFRESH_TTL_SEC,
  RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from 'src/utils/constants/auth/auth.constants';
import {
  generateRawToken,
  hashToken,
} from 'src/utils/helpers/auth/auth.helpers';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly mailService: MailService,
    private readonly sessionService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async signup(dto: SignUpDto) {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const hashPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiry = new Date(Date.now() + VERIFICATION_TTL_MS);

    await this.userService.createUser({
      name: dto.name,
      email: dto.email,
      password: hashPassword,
      verificationToken: tokenHash,
      verificationTokenExpiry: expiry,
    });

    await this.mailService.sendVerificationEmail(dto.email, rawToken);

    return { message: 'Check your email to verify your account.' };
  }

  private async issueSession(
    user: { id: string; email: string },
    userAgent?: string,
  ) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = generateRawToken();
    const tokenHash = hashToken(refreshToken);

    await this.sessionService.createSession({
      userId: user.id,
      tokenHash,
      userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    });
    return { accessToken, refreshToken };
  }

  async verifyEmail(rawToken: string, userAgent?: string) {
    const tokenHash = hashToken(rawToken);

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
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid credentials');
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Please verify your email before logging in.',
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
    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.sessionService.findByTokenHash(tokenHash);
    if (!session) throw new UnauthorizedException('Invalid session');
    if (session.expiresAt < new Date()) {
      await this.sessionService.deleteByTokenHash(tokenHash);
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.userService.findById(session.userId);
    if (!user) throw new UnauthorizedException('Invalid session');

    const newRefreshToken = generateRawToken();
    const newTokenHash = hashToken(newRefreshToken);
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
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiry = new Date(Date.now() + RESET_TTL_MS);

      await this.userService.setResetToken(user.id, tokenHash, expiry);
      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    }
    return {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);

    const user = await this.userService.findByResetToken(tokenHash);
    if (!user) throw new UnauthorizedException('Invalid or expired reset link');
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.userService.resetPassword(user.id, hashedPassword),
      this.sessionService.deleteAllForUser(user.id),
    ]);
    return { message: 'Password updated. Please log in again.' };
  }

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await this.sessionService
      .deleteByTokenHash(tokenHash)
      .catch(() => undefined);
  }

  async logoutAll(userId: string) {
    await this.sessionService.deleteAllForUser(userId);
  }
  async resendVerification(email: string) {
    const user = await this.userService.findByEmail(email);
    if (user && !user.emailVerified) {
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiry = new Date(Date.now() + VERIFICATION_TTL_MS);

      await this.userService.setVerificationToken(user.id, tokenHash, expiry);
      await this.mailService.sendVerificationEmail(user.email, rawToken);
    }
    return {
      message: 'If your account needs verification,a new linkk has been sent',
    };
  }
}
