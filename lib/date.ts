type DateInput = string | number | Date;

export function formatUtcDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locales?: Intl.LocalesArgument,
) {
  return new Intl.DateTimeFormat(locales, {
    timeZone: "UTC",
    ...options,
  }).format(new Date(value));
}
