import type { AccountRequestOptions } from './fetch-function';

const driveApi = 'https://www.googleapis.com/drive/v3';
const googleDocMimeType = 'application/vnd.google-apps.document';

interface DriveFileListResponse {
  files: { id: string; name: string; modifiedTime: string; webViewLink: string }[];
}

export async function pollNotesOnce(options: AccountRequestOptions): Promise<void> {
  const authorization = { Authorization: `Bearer ${options.accessToken}` };
  const listUrl = new URL(`${driveApi}/files`);
  listUrl.searchParams.set('q', `name contains 'Notes by Gemini' and mimeType = '${googleDocMimeType}'`);
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
  const listResponse = await options.fetch(listUrl, { headers: authorization });
  const fileList = (await listResponse.json()) as DriveFileListResponse;
  const docs = [];
  for (const file of fileList.files) {
    const exportUrl = new URL(`${driveApi}/files/${encodeURIComponent(file.id)}/export`);
    exportUrl.searchParams.set('mimeType', 'text/plain');
    const exportResponse = await options.fetch(exportUrl, { headers: authorization });
    docs.push({
      id: file.id,
      title: file.name,
      modifiedTime: file.modifiedTime,
      webLink: file.webViewLink,
      text: await exportResponse.text(),
    });
  }
  await options.fetch(`${options.backendUrl}/notes-report`, {
    method: 'POST',
    body: JSON.stringify({ accountEmail: options.accountEmail, docs }),
  });
}
