export interface NotesActionItem {
  text: string;
}

const nextStepsHeading = 'Suggested next steps';

export const notesActionItems = (document: string): NotesActionItem[] => {
  const lines = document.split('\n');
  const headingIndex = lines.indexOf(nextStepsHeading);
  return lines
    .slice(headingIndex + 1)
    .filter((line) => line.trim() !== '')
    .map((text) => ({ text }));
};
