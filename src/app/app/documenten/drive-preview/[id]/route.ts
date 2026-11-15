import { requireDriveBrowser } from '@/lib/drive-browser-runtime';
import { readDriveImagePreview } from '@/lib/drive-image-preview';
export const runtime = 'nodejs';
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const headers = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Cross-Origin-Resource-Policy':'same-origin'};
  if (process.env.BESC_DOSSIER_LINKS_ENABLED !== 'true' || process.env.BESC_DRIVE_BROWSER_ENABLED !== 'true') return new Response(null,{status:404,headers});
  try {
    const {browser, token} = await requireDriveBrowser();
    const {id} = await params;
    const image = await readDriveImagePreview(id,browser,token);
    return new Response(new Uint8Array(image), {headers:{...headers,'Content-Type':'image/png'}});
  } catch {return new Response('Preview niet beschikbaar.',{status:403,headers});}
}
