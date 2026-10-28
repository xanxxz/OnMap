import { isAllowedOrigin, parseAllowedOrigins } from './allowed-origins';
import {
  isOwnerAdminPath,
  ownerAdminOrigin,
} from '../owner-admin/owner-admin.config';
export const isAllowedHttpOrigin = (
  path: string,
  origin: string | undefined,
  publicOrigins: string | undefined,
  adminOrigin: string | undefined,
): boolean =>
  isOwnerAdminPath(path)
    ? origin === undefined || origin === ownerAdminOrigin(adminOrigin)
    : isAllowedOrigin(origin, parseAllowedOrigins(publicOrigins));
