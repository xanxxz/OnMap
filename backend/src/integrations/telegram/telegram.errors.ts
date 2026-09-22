export type TelegramIntegrationErrorCode =
  | 'DISABLED'
  | 'AUTH_FAILED'
  | 'SOURCE_NOT_FOUND'
  | 'CONNECTION_ERROR'
  | 'INVALID_SESSION';

export class TelegramIntegrationError extends Error {
  constructor(
    public readonly code: TelegramIntegrationErrorCode,
    message: string,
  ) {
    super(message);

    this.name = 'TelegramIntegrationError';
  }
}
