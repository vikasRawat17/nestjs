import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly logger = new Logger(MailService.name);

  async sendVerificationEmail(to: string, rawToken: string) {
    const link = `${process.env.APP_BASE_URL}/auth/verify-email?token=${rawToken}`;

    const { data, error } = await this.resend.emails.send({
      from: process.env.MAIL_FROM as string,
      to,
      subject: 'Verify your Email',
      html: `<p>Welcome to SkillSwap! Click to verify:</p>
               <a href="${link}">Verify my email</a>
               <p>This link expires in 24 hours.</p>`,
    });
    if (error) {
      this.logger.error(`Resend failed: ${JSON.stringify(error)}`);
      throw new Error('Failed to send verification email');
    }
    return data;
  }
}
