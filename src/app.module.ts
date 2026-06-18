import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
