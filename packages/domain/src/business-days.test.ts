import { describe, expect, it } from 'vitest';

import { businessDaysBetween } from './business-days';

describe('businessDaysBetween', () => {
  it('skips Saturday and Sunday in the business time zone: Friday 17:00 to Tuesday 17:00 is 2 business days', () => {
    const fridayFivePm = '2026-11-06T23:00:00.000Z';
    const tuesdayFivePm = '2026-11-10T23:00:00.000Z';

    expect(businessDaysBetween(fridayFivePm, tuesdayFivePm, 'America/Mexico_City')).toBe(2);
  });
});
