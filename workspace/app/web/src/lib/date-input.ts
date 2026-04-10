const millisecondsPerDay = 1000 * 60 * 60 * 24;

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateForInput(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
}

export function addDaysToLocalDate(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDateInputParts(value: string): [number, number, number] | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1] ?? "", 10),
    Number.parseInt(match[2] ?? "", 10),
    Number.parseInt(match[3] ?? "", 10)
  ];
}

export function shiftDateInput(value: string, days: number): string {
  const parts = parseDateInputParts(value);
  if (!parts) {
    return value;
  }

  const [year, month, day] = parts;
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * millisecondsPerDay);
  return `${shifted.getUTCFullYear()}-${padDatePart(shifted.getUTCMonth() + 1)}-${padDatePart(
    shifted.getUTCDate()
  )}`;
}

export function differenceInCalendarDays(startDate: string, endDate: string): number {
  const startParts = parseDateInputParts(startDate);
  const endParts = parseDateInputParts(endDate);
  if (!startParts || !endParts) {
    return 0;
  }

  const [startYear, startMonth, startDay] = startParts;
  const [endYear, endMonth, endDay] = endParts;
  const startAt = Date.UTC(startYear, startMonth - 1, startDay);
  const endAt = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.round((endAt - startAt) / millisecondsPerDay);
}
