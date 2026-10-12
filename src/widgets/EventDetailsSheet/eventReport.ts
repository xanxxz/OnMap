import type { RoadEvent } from '../../entities/road-event/model/roadEvent';
import { SUPPORT_URL } from '../../shared/config/support';

export const EVENT_REPORT_REASONS = [
  { id: 'WRONG_TYPE', label: 'Неверный тип события' },
  { id: 'WRONG_LOCATION', label: 'Точка указана неверно' },
  { id: 'DUPLICATE', label: 'Дубль' },
  { id: 'OTHER_ABUSE', label: 'Другое злоупотребление' },
] as const;

export type EventReportReason = (typeof EVENT_REPORT_REASONS)[number]['id'];

export const buildEventReportMessage = (
  event: RoadEvent,
  reason: EventReportReason,
): string => {
  const reasonLabel = EVENT_REPORT_REASONS.find(item => item.id === reason)?.label;
  const timestampLabel = event.source === 'TOMTOM' ? 'Получено' : 'Создано';
  const timestamp = event.source === 'TOMTOM' ? event.fetchedAt : event.createdAt;

  return [
    'Жалоба на событие OnMap',
    `ID: ${event.id}`,
    `Тип: ${event.type}`,
    `${timestampLabel}: ${timestamp}`,
    `Причина: ${reasonLabel}`,
  ].join('\n');
};

export const buildEventReportUrl = (message: string): string =>
  `${SUPPORT_URL}?text=${encodeURIComponent(message)}`;
