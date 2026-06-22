import type { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
} from 'src/utils/constants/auth/auth.constants';

export const hashToken = (raw: string) =>
  createHash('sha256').update(raw).digest('hex');

export const generateRawToken = () => randomBytes(32).toString('hex');

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
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

export function clearAuthCookies(res: Response) {
  const common = { domain: process.env.COOKIE_DOMAIN };
  res.clearCookie('access_token', { ...common, path: '/' });
  res.clearCookie('refresh_token', { ...common, path: '/auth' });
}
