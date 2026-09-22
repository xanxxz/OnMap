export type TelegramDialogType = 'group' | 'supergroup' | 'channel';

export type TelegramDialogTypeFilter = 'group' | 'channel';

export interface TelegramDialogSummary {
  readonly title: string;
  readonly type: TelegramDialogType;
  readonly username?: string;
  readonly id: string;
}

export interface TelegramDialogFilterOptions {
  readonly search?: string;
  readonly type?: TelegramDialogTypeFilter;
}

export const parseTelegramDialogArguments = (
  args: readonly string[],
): TelegramDialogFilterOptions => {
  let search: string | undefined;
  let type: TelegramDialogTypeFilter | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--search') {
      search = requireArgumentValue(args, ++index, '--search');
      continue;
    }

    if (argument?.startsWith('--search=')) {
      search = requireInlineValue(argument, '--search');
      continue;
    }

    if (argument === '--type') {
      type = parseType(requireArgumentValue(args, ++index, '--type'));
      continue;
    }

    if (argument?.startsWith('--type=')) {
      type = parseType(requireInlineValue(argument, '--type'));
      continue;
    }

    throw new Error(`Unknown argument: ${argument ?? ''}`);
  }

  return {
    ...(search === undefined ? {} : { search }),
    ...(type === undefined ? {} : { type }),
  };
};

export const filterTelegramDialogs = (
  dialogs: readonly TelegramDialogSummary[],
  options: TelegramDialogFilterOptions,
): TelegramDialogSummary[] => {
  const search = normalizeSearch(options.search);

  return dialogs.filter((dialog) => {
    if (
      options.type === 'group' &&
      dialog.type !== 'group' &&
      dialog.type !== 'supergroup'
    ) {
      return false;
    }

    if (options.type === 'channel' && dialog.type !== 'channel') {
      return false;
    }

    if (search.length === 0) {
      return true;
    }

    return normalizeSearch(dialog.title).includes(search);
  });
};

export const formatTelegramDialogs = (
  dialogs: readonly TelegramDialogSummary[],
): string => {
  const lines = [`Found: ${dialogs.length}`];

  if (dialogs.length === 0) {
    lines.push('', 'No matching dialogs.');

    return `${lines.join('\n')}\n`;
  }

  for (const dialog of dialogs) {
    lines.push(
      '',
      `Title: ${dialog.title}`,
      `Type: ${dialog.type}`,
      `Username: ${dialog.username ?? '—'}`,
      `ID: ${dialog.id}`,
    );
  }

  return `${lines.join('\n')}\n`;
};

const normalizeSearch = (value: string | undefined): string =>
  value?.trim().toLocaleLowerCase('ru-RU') ?? '';

const requireArgumentValue = (
  args: readonly string[],
  index: number,
  argument: string,
): string => {
  const value = args[index]?.trim() ?? '';

  if (value.length === 0 || value.startsWith('--')) {
    throw new Error(`${argument} requires a value`);
  }

  return value;
};

const requireInlineValue = (argument: string, name: string): string => {
  const value = argument.slice(name.length + 1).trim();

  if (value.length === 0) {
    throw new Error(`${name} requires a value`);
  }

  return value;
};

const parseType = (value: string): TelegramDialogTypeFilter => {
  if (value === 'group' || value === 'channel') {
    return value;
  }

  throw new Error('--type must be group or channel');
};
