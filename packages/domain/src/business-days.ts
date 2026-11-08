const dayInMilliseconds = 24 * 60 * 60 * 1000;

export function businessDaysBetween(start: string, end: string, timeZone: string): number {
  const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone });
  const endTime = Date.parse(end);
  let count = 0;
  for (let time = Date.parse(start) + dayInMilliseconds; time <= endTime; time += dayInMilliseconds) {
    const weekday = weekdayFormat.format(time);
    if (weekday !== 'Sat' && weekday !== 'Sun') count += 1;
  }
  return count;
}
