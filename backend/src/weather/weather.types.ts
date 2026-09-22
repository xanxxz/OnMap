export interface CurrentWeather {
  readonly temperature: number;
  readonly condition: string;
  readonly icon?: string;
  readonly updatedAt: string;
}

export interface YandexWeatherResponse {
  readonly now?: unknown;
  readonly now_dt?: unknown;
  readonly fact?: {
    readonly temp?: unknown;
    readonly condition?: unknown;
    readonly icon?: unknown;
  };
}
