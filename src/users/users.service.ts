import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  createUser(data: {
    name: string;
    email: string;
    password: string;
    verificationToken: string;
    verificationTokenExpiry: Date;
  }) {
    return this.prisma.user.create({ data });
  }

  findByVerificationToken(verificationToken: string) {
    return this.prisma.user.findUnique({ where: { verificationToken } });
  }

  markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });
  }
}
