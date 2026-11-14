import type { AccountRequestOptions } from './fetch-function';

const driveApi = 'https://www.googleapis.com/drive/v3';
const googleDocMimeType = 'application/vnd.google-apps.document';
const notesTitleMarker = 'Notes by Gemini';

interface NotesPollOptions extends AccountRequestOptions {
  lastSuccessfulPollTime?: string | undefined;
}

interface DriveFileListResponse {
  files: { id: string; name: string; modifiedTime: string; webViewLink: string }[];
}

function notesFilesQuery(lastSuccessfulPollTime: string | undefined): string {
  const notesDocsQuery = `name contains '${notesTitleMarker}' and mimeType = '${googleDocMimeType}'`;
  if (lastSuccessfulPollTime === undefined) return notesDocsQuery;
  return `${notesDocsQuery} and modifiedTime > '${lastSuccessfulPollTime}'`;
}

async function listNotesFiles(
  options: NotesPollOptions,
  authorization: Record<string, string>,
): Promise<DriveFileListResponse> {
  const listUrl = new URL(`${driveApi}/files`);
  listUrl.searchParams.set('q', notesFilesQuery(options.lastSuccessfulPollTime));
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
  const listResponse = await options.fetch(listUrl, { headers: authorization });
  return (await listResponse.json()) as DriveFileListResponse;
}

async function exportPlainText(
  options: AccountRequestOptions,
  authorization: Record<string, string>,
  fileId: string,
): Promise<string | undefined> {
  const exportUrl = new URL(`${driveApi}/files/${encodeURIComponent(fileId)}/export`);
  exportUrl.searchParams.set('mimeType', 'text/plain');
  const exportResponse = await options.fetch(exportUrl, { headers: authorization });
  if (!exportResponse.ok) {
    console.error(`notes poll: export of ${fileId} failed with ${String(exportResponse.status)}`);
    return undefined;
  }
  return exportResponse.text();
}

export async function pollNotesOnce(options: NotesPollOptions): Promise<string | undefined> {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const fileList = await listNotesFiles(options, authorization);
  const docs = [];
  for (const file of fileList.files.filter((listed) => listed.name.includes(notesTitleMarker))) {
    const text = await exportPlainText(options, authorization, file.id);
    if (text === undefined) continue;
    docs.push({
      id: file.id,
      title: file.name,
      modifiedTime: file.modifiedTime,
      webLink: file.webViewLink,
      text,
    });
  }
  await options.fetch(`${options.backendUrl}/notes-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, docs }),
  });
  return options.lastSuccessfulPollTime;
}
