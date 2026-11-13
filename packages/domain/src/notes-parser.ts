export interface NotesActionItem {
  assignee?: string;
  text: string;
}

const actionItemHeadings = ['Suggested next steps', 'Action items'];
const followingHeadings = ['Details'];

const actionItem = (line: string): NotesActionItem => {
  const assigneeEnd = line.indexOf('] ');
  return line.startsWith('[') && assigneeEnd !== -1
    ? { assignee: line.slice(1, assigneeEnd), text: line.slice(assigneeEnd + 2) }
    : { text: line };
};

export const notesActionItems = (document: string): NotesActionItem[] => {
  const lines = document.split('\n');
  const headingIndex = lines.findIndex((line) => actionItemHeadings.includes(line));
  if (headingIndex === -1) return [];
  const sectionLines = lines.slice(headingIndex + 1);
  const sectionEnd = sectionLines.findIndex((line) => line.trim() === '' || followingHeadings.includes(line));
  return sectionLines
    .slice(0, sectionEnd === -1 ? undefined : sectionEnd)
    .map(actionItem);
};
