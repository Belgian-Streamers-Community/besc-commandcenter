'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireDriveBrowser } from '@/lib/drive-browser-runtime';
import { driveBrowserKind, driveBrowserUrl } from '@/lib/drive-browser';
import { dossierEntityConfig, dossierEntityTypes, dossierPath } from '@/lib/dossier-relations';
import { hasPermission } from '@/lib/permissions';

export async function readDriveBrowserPage(folderId: string, pageToken?: string) {
  const {browser} = await requireDriveBrowser();
  return browser.page(folderId, pageToken);
}

export async function linkDriveBrowserFile(formData: FormData) {
  const parsed = z.object({file_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), entity_type: z.enum(dossierEntityTypes), entity_id: z.string().uuid()}).safeParse(Object.fromEntries(formData));
  if (!parsed.success || process.env.BESC_DOSSIER_LINKS_ENABLED !== 'true') redirect('/app/documenten?fout=drive-koppelen');
  const {supabase, user, membership, browser} = await requireDriveBrowser();
  const config = dossierEntityConfig[parsed.data.entity_type];
  if (!hasPermission(membership, config.capability)) redirect('/app/documenten?fout=rechten');
  const {data: dossier, error} = await supabase.from(config.table).select('id').eq('organization_id', membership.organization_id).eq('id', parsed.data.entity_id).is('deleted_at', null).maybeSingle();
  if (error || !dossier) redirect('/app/documenten?fout=dossier-niet-beschikbaar');
  // Re-read provider metadata and ancestry at save time. Never trust the title,
  // URL, MIME type or previous browser observation supplied by a client.
  let file;
  try {file = await browser.file(parsed.data.file_id);} catch {redirect('/app/documenten?fout=drive-controleren');}
  if (file.mimeType === 'application/vnd.google-apps.shortcut') redirect('/app/documenten?fout=drive-snelkoppeling');
  const {error: saveError} = await supabase.from('record_links').insert({organization_id: membership.organization_id, entity_type: parsed.data.entity_type, entity_id: parsed.data.entity_id, label: file.name.slice(0,120), url: driveBrowserUrl(file), link_type: driveBrowserKind(file), created_by: user.id});
  // Existing record_links triggers keep the central document register in sync.
  if (saveError) redirect('/app/documenten?fout=drive-link-opslaan');
  revalidatePath('/app/documenten'); revalidatePath(dossierPath(parsed.data.entity_type, parsed.data.entity_id));
  redirect(`${dossierPath(parsed.data.entity_type, parsed.data.entity_id)}?succes=link-opgeslagen`);
}
