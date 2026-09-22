import {
  filterTelegramDialogs,
  formatTelegramDialogs,
  parseTelegramDialogArguments,
  type TelegramDialogSummary,
} from './telegram-dialog-filter';

const DIALOGS: readonly TelegramDialogSummary[] = [
  {
    title: 'Дороги Балаково',
    type: 'supergroup',
    id: '-1001234567890',
  },
  {
    title: 'Соседи Балаково',
    type: 'group',
    id: '-987654321',
  },
  {
    title: 'Новости Балаково',
    type: 'channel',
    username: '@balakovo_news',
    id: '-1005555555555',
  },
];

describe('telegram dialog filtering', () => {
  it('finds a group by its full title', () => {
    expect(
      filterTelegramDialogs(DIALOGS, { search: 'Дороги Балаково' }),
    ).toEqual([DIALOGS[0]]);
  });

  it('finds dialogs by a partial title', () => {
    expect(filterTelegramDialogs(DIALOGS, { search: 'дороги' })).toEqual([
      DIALOGS[0],
    ]);
  });

  it('searches case-insensitively', () => {
    expect(filterTelegramDialogs(DIALOGS, { search: 'БАЛАКОВО' })).toHaveLength(
      3,
    );
  });

  it('finds a group without a username and formats a copyable ID', () => {
    const matches = filterTelegramDialogs(DIALOGS, { search: 'дороги' });
    const output = formatTelegramDialogs(matches);

    expect(output).toContain('Username: —');
    expect(output).toContain('ID: -1001234567890');
    expect(output).not.toContain('undefined');
  });

  it('--type group includes groups and supergroups but excludes channels', () => {
    expect(filterTelegramDialogs(DIALOGS, { type: 'group' })).toEqual([
      DIALOGS[0],
      DIALOGS[1],
    ]);
  });

  it('--type channel includes only ordinary channels', () => {
    expect(filterTelegramDialogs(DIALOGS, { type: 'channel' })).toEqual([
      DIALOGS[2],
    ]);
  });

  it('returns a clear result when nothing matches', () => {
    expect(
      formatTelegramDialogs(
        filterTelegramDialogs(DIALOGS, { search: 'нет такого чата' }),
      ),
    ).toBe('Found: 0\n\nNo matching dialogs.\n');
  });

  it('parses search and type command-line arguments', () => {
    expect(
      parseTelegramDialogArguments(['--search', 'дороги', '--type', 'group']),
    ).toEqual({ search: 'дороги', type: 'group' });
  });
});
