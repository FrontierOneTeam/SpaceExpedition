import strings from '../data/strings.en.json';

export type StringKey = keyof typeof strings;

export function t(key: StringKey): string {
  return strings[key];
}
