import { describe, expect, it } from 'vitest';

import { calendarTimeWindow } from './calendar-time-window';

describe('calendarTimeWindow', () => {
  it('covers today and tomorrow in America/Mexico_City, even when the UTC day has already rolled over', () => {
    const lateEveningInMexicoCity = new Date('2026-11-02T23:30:00-06:00');

    const window = calendarTimeWindow(lateEveningInMexicoCity, 'America/Mexico_City');

    expect(new Date(window.timeMin).getTime()).toBe(new Date('2026-11-02T00:00:00-06:00').getTime());
    expect(new Date(window.timeMax).getTime()).toBe(new Date('2026-11-04T00:00:00-06:00').getTime());
  });

  it("starts at that local day's midnight and ends at the end of the next local day on a different date, late at night", () => {
    const lateNightInMexicoCity = new Date('2027-03-15T22:45:00-06:00');

    const window = calendarTimeWindow(lateNightInMexicoCity, 'America/Mexico_City');

    expect(new Date(window.timeMin).getTime()).toBe(new Date('2027-03-15T00:00:00-06:00').getTime());
    expect(new Date(window.timeMax).getTime()).toBe(new Date('2027-03-17T00:00:00-06:00').getTime());
  });
});
