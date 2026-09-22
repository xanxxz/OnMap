export type TomTomIntegrationErrorCode =
  | 'DISABLED'
  | 'UNSUPPORTED_CITY'
  | 'INVALID_QUERY'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

export class TomTomIntegrationError extends Error {
  constructor(
    public readonly code: TomTomIntegrationErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);

    this.name = 'TomTomIntegrationError';
  }
}
