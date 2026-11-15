import strings from '../data/strings.en.json';

export type StringKey = keyof typeof strings;

/** Player-facing text by key. `{name}` placeholders are filled from `params`. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const text: string = strings[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
