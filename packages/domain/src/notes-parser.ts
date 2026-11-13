export interface NotesActionItem {
  text: string;
}

const actionItemHeadings = ['Suggested next steps', 'Action items'];

export const notesActionItems = (document: string): NotesActionItem[] => {
  const lines = document.split('\n');
  const headingIndex = lines.findIndex((line) => actionItemHeadings.includes(line));
  return lines
    .slice(headingIndex + 1)
    .filter((line) => line.trim() !== '')
    .map((text) => ({ text }));
};
