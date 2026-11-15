import sharp from 'sharp';
import type { createDriveBrowser } from './drive-browser.ts';

export async function readDriveImagePreview(id: string, browser: ReturnType<typeof createDriveBrowser>, token: () => Promise<string>, transport: typeof fetch = fetch) {
  const file = await browser.file(id);
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimeType)) throw Error('Dit bestand ondersteunt geen afbeeldingspreview.');
  const response = await transport(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {method: 'GET', headers: {Authorization: `Bearer ${await token()}`}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000)});
  if (!response.ok || !response.body || response.headers.get('content-type')?.split(';')[0] !== file.mimeType) throw Error('Afbeelding niet beschikbaar.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {for (;;) {const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 5_000_000) throw Error('Afbeelding te groot.'); chunks.push(item.value);}}
  finally {await reader.cancel();}
  const bytes = Buffer.concat(chunks);
  // Reject mislabeled SVG/PDF before a decoder sees the source, even if both
  // provider metadata and Content-Type claim it is a raster image.
  const kind = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes.subarray(0,3).equals(Buffer.from([255,216,255])) ? 'image/jpeg'
    : ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString('ascii')) ? 'image/gif'
    : bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP' ? 'image/webp' : null;
  if (kind !== file.mimeType) throw Error('Afbeeldingsinhoud komt niet overeen met het bestandstype.');
  // Decode and re-encode raster only, bound decompression and strip metadata.
  return sharp(bytes, {limitInputPixels: 20_000_000, animated: false}).rotate().resize(640,640,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
