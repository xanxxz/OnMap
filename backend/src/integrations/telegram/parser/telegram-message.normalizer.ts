import type { NormalizedTelegramParserMessage } from './telegram-parser.types';
import type { TelegramParserMessage } from './telegram-parser.types';

const ABBREVIATION_REPLACEMENTS: readonly [RegExp, string][] = [
  [/(?<![\p{L}\p{N}])мкр[.-]?(?=\s|$)/gu, 'микрорайон'],
  [/(?<![\p{L}\p{N}])ул[.]?(?=\s|$)/gu, 'улица'],
  [/(?<![\p{L}\p{N}])перекр[.]?(?=\s|$)/gu, 'перекресток'],
  [/(?<![\p{L}\p{N}])ж\s+г(?![\p{L}\p{N}])/gu, 'жг'],
];

export const normalizeTelegramText = (text: string): string => {
  let normalized = text
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/[—–]+/gu, '-')
    .replace(/[^\p{L}\p{N}\s/,;-]+/gu, ' ');

  for (const [pattern, replacement] of ABBREVIATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/gu, ' ').trim();
};

export const normalizeTelegramParserMessage = (
  message: TelegramParserMessage,
): NormalizedTelegramParserMessage => ({
  ...message,
  normalizedText: normalizeTelegramText(message.text),
  hadQuestionMark: message.text.includes('?'),
});
