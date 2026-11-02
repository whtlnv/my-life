function wallClockIn(now: Date, timeZone: string): { year: number; monthIndex: number; day: number; offset: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const year = part('year');
  const monthIndex = part('month') - 1;
  const day = part('day');
  const wallClockAsUniversal = Date.UTC(year, monthIndex, day, part('hour'), part('minute'), part('second'));
  const offset = wallClockAsUniversal - Math.floor(now.getTime() / 1000) * 1000;
  return { year, monthIndex, day, offset };
}

export function calendarTimeWindow(now: Date, timeZone: string): { timeMin: string; timeMax: string } {
  const { year, monthIndex, day, offset } = wallClockIn(now, timeZone);
  const startOfToday = Date.UTC(year, monthIndex, day) - offset;
  const endOfTomorrow = Date.UTC(year, monthIndex, day + 2) - offset;
  return { timeMin: new Date(startOfToday).toISOString(), timeMax: new Date(endOfTomorrow).toISOString() };
}
