import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { parsePartnerOwnerIds } from '../partner-placements/partner-bot.service';
import { OWNER_ADMIN_TTL_MS } from './owner-admin.config';
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class OwnerAdminAuthService {
  private readonly buckets = new Map<
    string,
    { start: number; count: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private assertEnabled() {
    if (this.config.get<string>('OWNER_ADMIN_ENABLED') !== 'true')
      throw new ForbiddenException('Панель владельца выключена');
  }
  private allowed(ownerId: string) {
    return parsePartnerOwnerIds(
      this.config.get<string>('TELEGRAM_PARTNER_OWNER_IDS'),
    ).has(ownerId);
  }
  private limit(key: string, max: number) {
    const now = Date.now();
    if (this.buckets.size > 1024)
      for (const [id, row] of this.buckets)
        if (now - row.start >= 60_000) this.buckets.delete(id);
    const previous = this.buckets.get(key);
    const row =
      previous && now - previous.start < 60_000
        ? previous
        : { start: now, count: 0 };
    this.buckets.set(key, row);
    if (++row.count > max)
      throw new HttpException(
        'Слишком много запросов. Повторите через минуту.',
        429,
      );
  }
  async authenticate(authorization?: string) {
    this.assertEnabled();
    this.limit('all', 240);
    const match = /^Bearer (onmap_owner_[A-Za-z0-9_-]{43})$/u.exec(
      authorization ?? '',
    );
    if (!match)
      throw new UnauthorizedException('Нужен действующий токен владельца');
    const hash = digest(match[1]);
    const row = await this.prisma.ownerAdminSession.findUnique({
      where: { tokenHash: hash },
    });
    if (
      !row ||
      row.expiresAt.getTime() <= Date.now() ||
      !this.allowed(row.ownerTelegramId)
    )
      throw new UnauthorizedException(
        'Токен истёк, отозван или недействителен',
      );
    this.limit(row.ownerTelegramId, 120);
    return {
      ownerId: row.ownerTelegramId,
      tokenHash: hash,
      expiresAt: row.expiresAt,
    };
  }
  async issue(ownerId: string) {
    this.assertEnabled();
    if (!this.allowed(ownerId))
      throw new ForbiddenException('Владелец отсутствует в allowlist');
    this.limit('issue:' + ownerId, 3);
    const token = `onmap_owner_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + OWNER_ADMIN_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.ownerAdminSession.upsert({
        where: { ownerTelegramId: ownerId },
        create: {
          ownerTelegramId: ownerId,
          tokenHash: digest(token),
          expiresAt,
        },
        update: { tokenHash: digest(token), expiresAt },
      });
      await tx.ownerAdminAudit.create({
        data: {
          ownerTelegramId: ownerId,
          action: 'SESSION_ISSUED',
          entityId: 'session',
        },
      });
    });
    return { token, expiresAt };
  }
  async rotate(actor: OwnerActor) {
    const token = `onmap_owner_${randomBytes(32).toString('base64url')}`;
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.ownerAdminSession.updateMany({
        where: {
          ownerTelegramId: actor.ownerId,
          tokenHash: actor.tokenHash,
          expiresAt: { gt: new Date() },
        },
        data: { tokenHash: digest(token) },
      });
      if (changed.count !== 1)
        throw new UnauthorizedException('Сессия уже обновлена');
      await tx.ownerAdminAudit.create({
        data: {
          ownerTelegramId: actor.ownerId,
          action: 'SESSION_ROTATED',
          entityId: 'session',
        },
      });
    });
    return { token, expiresAt: actor.expiresAt };
  }
  async revoke(actor: OwnerActor) {
    await this.prisma.$transaction(async (tx) => {
      await tx.ownerAdminSession.deleteMany({
        where: { ownerTelegramId: actor.ownerId, tokenHash: actor.tokenHash },
      });
      await tx.ownerAdminAudit.create({
        data: {
          ownerTelegramId: actor.ownerId,
          action: 'SESSION_REVOKED',
          entityId: 'session',
        },
      });
    });
    return { revoked: true };
  }
}
export interface OwnerActor {
  ownerId: string;
  tokenHash: string;
  expiresAt: Date;
}
