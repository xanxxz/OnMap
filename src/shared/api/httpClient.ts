import {
  env,
} from '../config/env';

interface ApiErrorBody {
  message?: unknown;

  error?: unknown;
}

export class ApiError
  extends Error
{
  readonly status: number;

  readonly body:
    | unknown
    | null;

  constructor(
    message: string,
    status: number,
    body:
      | unknown
      | null,
  ) {
    super(message);

    this.name = 'ApiError';

    this.status = status;

    this.body = body;
  }
}

const createUrl = (
  path: string,
): string => {
  if (!env.apiBaseUrl) {
    throw new Error(
      'API_BASE_URL is not configured',
    );
  }

  const normalizedPath =
    path.startsWith('/')
      ? path
      : `/${path}`;

  return `${env.apiBaseUrl}${normalizedPath}`;
};

const parseResponseBody =
  async (
    response: Response,
  ): Promise<unknown> => {
    const text =
      await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(
        text,
      ) as unknown;
    } catch {
      return text;
    }
  };

const getErrorMessage = (
  body:
    | unknown
    | null,
  status: number,
): string => {
  if (
    typeof body ===
      'object' &&
    body !== null
  ) {
    const apiBody =
      body as ApiErrorBody;

    if (
      typeof apiBody.message ===
        'string'
    ) {
      return apiBody.message;
    }

    if (
      Array.isArray(
        apiBody.message,
      )
    ) {
      return apiBody.message
        .filter(
          item =>
            typeof item ===
            'string',
        )
        .join(', ');
    }
  }

  return `API request failed with status ${status}`;
};

export const httpRequest =
  async <T>(
    path: string,
    options:
      RequestInit = {},
  ): Promise<T> => {
    const headers =
      new Headers(
        options.headers,
      );

    headers.set(
      'Accept',
      'application/json',
    );

    if (
      options.body &&
      !headers.has(
        'Content-Type',
      )
    ) {
      headers.set(
        'Content-Type',
        'application/json',
      );
    }

    let response: Response;

    try {
      response =
        await fetch(
          createUrl(path),
          {
            ...options,

            headers,
          },
        );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown network error';

      throw new Error(
        `Network request failed: ${message}`,
      );
    }

    const body =
      await parseResponseBody(
        response,
      );

    if (!response.ok) {
      throw new ApiError(
        getErrorMessage(
          body,
          response.status,
        ),

        response.status,

        body,
      );
    }

    return body as T;
  };