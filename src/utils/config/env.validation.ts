// src/utils/config/env.validation.ts
import { URL } from 'url';

const validNodeEnvs = ['development', 'production', 'staging'] as const;

export type Env = {
  NODE_ENV: (typeof validNodeEnvs)[number];
  PORT: number;
  DB_STRING: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  APP_BASE_URL: string;
  JWT_ACCESS_SECRET: string;
  FRONTEND_URL: string;
  COOKIE_DOMAIN: string;
};

function assertString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  return value;
}

function assertUrl(name: string, value: unknown): string {
  const url = assertString(name, value);
  try {
    new URL(url);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  return url;
}

function assertPort(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0 || !Number.isInteger(port)) {
    throw new Error('PORT must be a positive integer');
  }

  return port;
}

function assertNodeEnv(value: unknown): Env['NODE_ENV'] {
  if (value === undefined) {
    return 'development';
  }

  if (
    typeof value !== 'string' ||
    !validNodeEnvs.includes(value as Env['NODE_ENV'])
  ) {
    throw new Error(`NODE_ENV must be one of: ${validNodeEnvs.join(', ')}`);
  }

  return value as Env['NODE_ENV'];
}

export function validateEnv(raw: Record<string, unknown>): Env {
  return {
    NODE_ENV: assertNodeEnv(raw.NODE_ENV),
    PORT: assertPort(raw.PORT),
    DB_STRING: assertString('DB_STRING', raw.DB_STRING),
    RESEND_API_KEY: assertString('RESEND_API_KEY', raw.RESEND_API_KEY),
    MAIL_FROM: assertString('MAIL_FROM', raw.MAIL_FROM),
    APP_BASE_URL: assertUrl('APP_BASE_URL', raw.APP_BASE_URL),
    JWT_ACCESS_SECRET: assertString('JWT_ACCESS_SECRET', raw.JWT_ACCESS_SECRET),
    FRONTEND_URL: assertUrl('FRONTEND_URL', raw.FRONTEND_URL),
    COOKIE_DOMAIN: assertString('COOKIE_DOMAIN', raw.COOKIE_DOMAIN),
  };
}
