import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionsService {
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
}
