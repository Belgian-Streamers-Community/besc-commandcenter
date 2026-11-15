import { z } from 'zod';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const folderMime = 'application/vnd.google-apps.folder';
const fileSchema = z.object({
  id: idSchema, name: z.string().min(1).max(500), mimeType: z.string().min(1).max(200),
  driveId: idSchema, parents: z.array(idSchema).max(1), trashed: z.boolean(),
  modifiedTime: z.string().datetime().optional(),
});
export type DriveBrowserFile = z.infer<typeof fileSchema>;
export type DriveBrowserPage = { folder: DriveBrowserFile; files: DriveBrowserFile[]; nextPageToken: string | null; incomplete: boolean; checkedAt: string };
export type DriveBrowserPort = { get(id: string): Promise<unknown>; list(folder: string, token?: string): Promise<unknown> };
export function driveBrowserUrl(file: DriveBrowserFile) {
  return file.mimeType === folderMime ? `https://drive.google.com/drive/folders/${file.id}` : `https://drive.google.com/file/d/${file.id}/view`;
}
export function driveBrowserKind(file: DriveBrowserFile): 'folder' | 'image' | 'document' {
  return file.mimeType === folderMime ? 'folder' : file.mimeType.startsWith('image/') ? 'image' : 'document';
}
/** No credentials or provider URLs enter the browser. Every read rechecks ancestry. */
export function createDriveBrowser(port: DriveBrowserPort, config: {rootId: string; driveId: string}) {
  idSchema.parse(config.rootId); idSchema.parse(config.driveId);
  async function withinRoot(id: string) {
    idSchema.parse(id);
    const seen = new Set<string>(); let current = id; let selected: DriveBrowserFile | undefined;
    for (let depth = 0; depth < 40; depth++) {
      if (seen.has(current)) throw Error('Mapstructuur bevat een kringverwijzing.');
      seen.add(current);
      const file = fileSchema.parse(await port.get(current));
      if (file.id !== current || file.trashed || file.driveId !== config.driveId) throw Error('Bestand niet beschikbaar binnen de ingestelde Drive.');
      if (depth > 0 && file.mimeType !== folderMime) throw Error('Ongeldig mappad.');
      selected ??= file;
      if (file.id === config.rootId) {
        if (file.mimeType !== folderMime) throw Error('De hoofdmap is geen map.');
        return selected;
      }
      if (file.parents.length !== 1) throw Error('Bestand staat buiten de hoofdmap.');
      current = file.parents[0];
    }
    throw Error('Mappad is te diep.');
  }
  return {
    file: withinRoot,
    async page(folderId: string, token?: string): Promise<DriveBrowserPage> {
      if (token && (token.length > 2048 || /[\x00-\x1f]/.test(token))) throw Error('Ongeldige vervolgpagina.');
      const folder = await withinRoot(folderId);
      if (folder.mimeType !== folderMime) throw Error('Alleen mappen kunnen worden geopend.');
      const result = z.object({ files: z.array(fileSchema).max(50), nextPageToken: z.string().min(1).max(2048).optional(), incompleteSearch: z.boolean() }).parse(await port.list(folderId, token));
      const files = new Map<string, DriveBrowserFile>();
      for (const file of result.files) {
        if (file.trashed || file.driveId !== config.driveId || file.parents[0] !== folderId || file.id === folderId) throw Error('Drive gaf een ongeldige mapinhoud terug.');
        const previous = files.get(file.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(file)) throw Error('Tegenstrijdige bestandsgegevens.');
        files.set(file.id, file);
      }
      if (token && result.nextPageToken === token) throw Error('Drive herhaalt dezelfde vervolgpagina.');
      return { folder, files: [...files.values()], nextPageToken: result.nextPageToken ?? null, incomplete: result.incompleteSearch, checkedAt: new Date().toISOString() };
    },
  };
}

/** Fixed host, GET only, metadata only; provider errors never disclose response bodies. */
export function googleDriveBrowserPort(token: () => Promise<string>, driveId: string, transport: typeof fetch = fetch): DriveBrowserPort {
  idSchema.parse(driveId);
  async function read(url: URL) {
    const response = await transport(url, {method: 'GET', headers: {Authorization: `Bearer ${await token()}`}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000)});
    if (!response.ok) throw Error(response.status === 403 ? 'Geen leesrechten op deze map.' : response.status === 404 ? 'Map of bestand niet meer beschikbaar.' : 'Drive tijdelijk niet bereikbaar. Probeer opnieuw.');
    if (!response.body) throw Error('Leeg Drive-antwoord.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 256_000) throw Error('Drive-antwoord te groot.'); chunks.push(part.value); } }
    finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const fields = 'id,name,mimeType,driveId,parents,trashed,modifiedTime';
  return {
    get(id) {idSchema.parse(id); const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`); url.search = new URLSearchParams({fields, supportsAllDrives: 'true'}).toString(); return read(url);},
    list(folder, pageToken) {
      idSchema.parse(folder); const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.search = new URLSearchParams({q: `'${folder}' in parents and trashed = false`, fields: `files(${fields}),nextPageToken,incompleteSearch`, corpora: 'drive', driveId, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '50', orderBy: 'folder,name', ...(pageToken ? {pageToken} : {})}).toString();
      return read(url);
    },
  };
}
