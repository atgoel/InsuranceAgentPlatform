export type Translate = (key: string) => string;
export function enumLabel(value: string, t: Translate): string {
  const key = `book.enum.${value}`;
  const translated = t(key);
  return translated === key ? t('book.enum.OTHER') : translated;
}
export function fieldLabel(value: string, t: Translate): string {
  const key = `book.field.${value}`;
  const translated = t(key);
  return translated === key
    ? value.startsWith('custom:')
      ? `${t('book.custom_field')} ${value.slice(7)}`
      : t('book.extra_field')
    : translated;
}
export function reasonLabel(reason: string, t: Translate): string {
  const [code, column] = reason.split(':');
  const key = `book.reason.${code}`;
  const translated = t(key);
  const message = translated === key ? t('book.reason.invalid_record') : translated;
  return column ? `${message} · ${fieldLabel(column, t) === t('book.extra_field') ? column : fieldLabel(column, t)}` : message;
}
export function displayField(key: string, value: unknown, t: Translate): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return t(value ? 'party.cf.yes' : 'party.cf.no');
  if (Array.isArray(value)) return value.map((item) => displayField(key, item, t)).join(' · ');
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([k, v]) => `${fieldLabel(k, t)}: ${displayField(k, v, t)}`)
      .join(' · ');
  if (['line', 'category', 'businessType', 'businessSource', 'coverType', 'fuel', 'relation'].includes(key))
    return enumLabel(String(value), t);
  return String(value);
}
