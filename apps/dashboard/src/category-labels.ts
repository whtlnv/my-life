// The human names and swatches of the triage categories, shared by the triage and categories pages.
export const categoryLabels: Record<string, string> = {
  action: 'Needs you',
  'cc-thread': 'Cc threads',
  expense: 'Expenses',
  'system-update': 'System updates',
  sales: 'Sales pitches',
  'calendar-drive': 'Calendar & Drive',
  unknown: 'Unknown',
};

export const categorySwatches: Record<string, string> = {
  action: '#2f6fed',
  'cc-thread': '#8b5cf6',
  expense: '#10b981',
  'system-update': '#f59e0b',
  sales: '#ec4899',
  'calendar-drive': '#06b6d4',
  unknown: '#7a8291',
};

export function categoryLabel(category: string): string {
  return categoryLabels[category] ?? category;
}
