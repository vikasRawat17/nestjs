import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { validateEnv } from './utils/config/env.validation';

async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(env.PORT);
}
void bootstrap();
