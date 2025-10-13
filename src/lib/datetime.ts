const CHINA_TIMEZONE = 'Asia/Shanghai';

type DateInput = string | number | Date | null | undefined;

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHINA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHINA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const mapParts = (parts: Intl.DateTimeFormatPart[]) => {
  const result: Record<string, string> = {};
  for (const part of parts) {
    result[part.type] = part.value;
  }
  return result;
};

export const parseDateInput = (input: DateInput): Date | undefined => {
  if (input === null || input === undefined) return undefined;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : new Date(input.getTime());
  }
  if (typeof input === 'number') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
};

export const formatChinaDateTime = (
  input: DateInput,
  options?: { includeSeconds?: boolean; dateOnly?: boolean },
): string | undefined => {
  const date = parseDateInput(input);
  if (!date) return undefined;
  if (options?.dateOnly) {
    const parts = mapParts(dateFormatter.formatToParts(date));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const parts = mapParts(dateTimeFormatter.formatToParts(date));
  const includeSeconds = options?.includeSeconds ?? true;
  const time = includeSeconds ? `${parts.hour}:${parts.minute}:${parts.second}` : `${parts.hour}:${parts.minute}`;
  return `${parts.year}-${parts.month}-${parts.day} ${time}`;
};

export const formatChinaDate = (input: DateInput): string | undefined =>
  formatChinaDateTime(input, { dateOnly: true });

export const formatChinaDateTimeForNotion = (input: DateInput): string | undefined => {
  const date = parseDateInput(input);
  if (!date) return undefined;
  const parts = mapParts(dateTimeFormatter.formatToParts(date));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};
