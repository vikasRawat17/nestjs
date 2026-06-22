import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  createSession(data: {
    userId: string;
    tokenHash: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    return this.prisma.session.create({ data });
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.session.findUnique({ where: { tokenHash } });
  }

  deleteByTokenHash(tokenHash: string) {
    return this.prisma.session.delete({ where: { tokenHash } });
  }
  deleteAllForUser(userId: string) {
    return this.prisma.session.deleteMany({ where: { userId } });
  }
  rotateSession(
    id: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent?: string,
  ) {
    return this.prisma.session.update({
      where: { id },
      data: { tokenHash, expiresAt, userAgent },
    });
  }

  deleteExpired() {
    return this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredSessions() {
    const { count } = await this.deleteExpired();
    if (count > 0) this.logger.log(`Deleted ${count} expired sessions`);
  }
}
