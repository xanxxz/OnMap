import { sanitizeTelegramSourceText } from './telegram-source-text';

describe('sanitizeTelegramSourceText', () => {
  it.each([
    ['авария на Комарова, притерлись', 'авария на Комарова, притерлись'],
    [
      'ДПС на Комарова, звоните +7 (999) 123-45-67',
      'ДПС на Комарова, звоните [телефон скрыт]',
    ],
    [
      'Пробка у моста https://example.com/map',
      'Пробка у моста [ссылка скрыта]',
    ],
    ['Пробка у моста t.me/road_chat', 'Пробка у моста [ссылка скрыта]'],
    ['Пробка у моста road.example.com', 'Пробка у моста [ссылка скрыта]'],
    [
      'ДПС @road_user, email road@example.com',
      'ДПС [контакт скрыт], email [контакт скрыт]',
    ],
    ['ДТП на Мира. Автор: Иван Иванов', 'ДТП на Мира. [личные данные скрыты]'],
    [
      'ДТП на Комарова, меня зовут Иван Иванов',
      'ДТП на Комарова, [личные данные скрыты]',
    ],
    ['https://example.com', undefined],
    ['TELEGRAM_SESSION=secret-value', undefined],
    ['авария **на Комарова**', 'авария на Комарова'],
  ])('sanitizes %s without losing the road context', (input, expected) => {
    expect(sanitizeTelegramSourceText(input)).toBe(expected);
  });
});
