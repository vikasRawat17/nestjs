import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [PrismaModule, MailModule, UsersModule, AuthModule, SessionsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
