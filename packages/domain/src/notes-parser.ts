export interface NotesActionItem {
  text: string;
}

const actionItemHeadings = ['Suggested next steps', 'Action items'];

export const notesActionItems = (document: string): NotesActionItem[] => {
  const lines = document.split('\n');
  const headingIndex = lines.findIndex((line) => actionItemHeadings.includes(line));
  if (headingIndex === -1) return [];
  const sectionLines = lines.slice(headingIndex + 1);
  const sectionEnd = sectionLines.findIndex((line) => line.trim() === '');
  return sectionLines
    .slice(0, sectionEnd === -1 ? undefined : sectionEnd)
    .map((text) => ({ text }));
};
