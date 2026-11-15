import { imagePreviewUrl } from './dossier-link-types.ts';
export async function loadImageLinkPreview(value: string, signal: AbortSignal, transport: typeof fetch = fetch) {
  const internal = /^\/app\/documenten\/drive-preview\/[A-Za-z0-9_-]{1,200}$/.test(value);
  const url = internal ? value : imagePreviewUrl(value);
  if (!url) throw Error('Geen veilige afbeeldingspreview beschikbaar.');
  const response = await transport(url, {signal, mode: 'cors', credentials: internal ? 'same-origin' : 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store'});
  const type = response.headers.get('content-type')?.split(';')[0];
  if (!response.ok || !type || !['image/jpeg','image/png','image/webp','image/gif'].includes(type) || !response.body) throw Error('Preview niet beschikbaar. Open de bron om de afbeelding te bekijken.');
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try {for (;;) {const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 5_000_000) throw Error('Afbeelding te groot voor een preview.'); chunks.push(new Uint8Array(item.value));}}
  finally {await reader.cancel();}
  return new Blob(chunks, {type});
}
