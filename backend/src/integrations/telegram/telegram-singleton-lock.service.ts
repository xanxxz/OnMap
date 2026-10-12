import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

export type TelegramSingletonComponent = 'moderation-bot' | 'mtproto-runtime';

const LOCK_IDS: Readonly<Record<TelegramSingletonComponent, string>> = {
  'moderation-bot': '809311001',
  'mtproto-runtime': '809311002',
};
const LOCK_HEARTBEAT_INTERVAL_MS = 10_000;
const LOCK_HEARTBEAT_TIMEOUT_MS = 5_000;

/**
 * Holds a PostgreSQL session advisory lock for the lifetime of an enabled
 * Telegram consumer. A dedicated pg.Client is intentional: session locks must
 * not be acquired through Prisma's pooled connection.
 */
@Injectable()
export class TelegramSingletonLockService {
  private readonly clients = new Map<TelegramSingletonComponent, Client>();
  private readonly heartbeatTimers = new Map<
    TelegramSingletonComponent,
    NodeJS.Timeout
  >();

  constructor(private readonly config: ConfigService) {}

  async tryAcquire(
    component: TelegramSingletonComponent,
    onLockLost: () => void = () => undefined,
  ): Promise<boolean> {
    if (this.clients.has(component)) return true;

    let client: Client | undefined;

    try {
      client = new Client({
        connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
        application_name: `onmap-telegram-${component}`,
        connectionTimeoutMillis: 5_000,
        keepAlive: true,
      });
      const lockClient = client;
      await lockClient.connect();
      const result = await lockClient.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        [LOCK_IDS[component]],
      );

      if (result.rows[0]?.acquired !== true) {
        await lockClient.end();
        return false;
      }

      this.clients.set(component, lockClient);
      lockClient.once('error', () =>
        this.handleLostLock(component, lockClient, onLockLost),
      );
      let heartbeatInFlight = false;
      const heartbeat = setInterval(() => {
        if (heartbeatInFlight || this.clients.get(component) !== lockClient) {
          return;
        }
        heartbeatInFlight = true;
        const timeout = setTimeout(
          () => this.handleLostLock(component, lockClient, onLockLost),
          LOCK_HEARTBEAT_TIMEOUT_MS,
        );
        void lockClient
          .query('SELECT 1')
          .then(() => clearTimeout(timeout))
          .catch(() => this.handleLostLock(component, lockClient, onLockLost))
          .finally(() => {
            clearTimeout(timeout);
            heartbeatInFlight = false;
          });
      }, LOCK_HEARTBEAT_INTERVAL_MS);
      heartbeat.unref();
      this.heartbeatTimers.set(component, heartbeat);
      return true;
    } catch {
      await client?.end().catch(() => undefined);
      throw new Error('TELEGRAM_SINGLETON_LOCK_UNAVAILABLE');
    }
  }

  async release(component: TelegramSingletonComponent): Promise<void> {
    const client = this.clients.get(component);
    if (client === undefined) return;

    this.clients.delete(component);
    const heartbeat = this.heartbeatTimers.get(component);
    if (heartbeat !== undefined) clearInterval(heartbeat);
    this.heartbeatTimers.delete(component);
    try {
      await client
        .query('SELECT pg_advisory_unlock($1::bigint)', [LOCK_IDS[component]])
        .catch(() => undefined);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.clients.keys()].map((component) => this.release(component)),
    );
  }

  private handleLostLock(
    component: TelegramSingletonComponent,
    client: Client,
    onLockLost: () => void,
  ): void {
    if (this.clients.get(component) !== client) return;
    this.clients.delete(component);
    const heartbeat = this.heartbeatTimers.get(component);
    if (heartbeat !== undefined) clearInterval(heartbeat);
    this.heartbeatTimers.delete(component);
    void client.end().catch(() => undefined);
    try {
      onLockLost();
    } catch {
      // Lock safety must not depend on diagnostic callbacks.
    }
  }
}
