import { requireDriveBrowser } from '@/lib/drive-browser-runtime';
import { dossierEntityConfig, dossierEntityTypes } from '@/lib/dossier-relations';
import { hasPermission } from '@/lib/permissions';
import { DriveBrowserPanel } from '@/components/drive-browser-panel';

export async function DriveBrowserSection() {
  if (process.env.BESC_DRIVE_BROWSER_ENABLED !== 'true') return null;
  let context;
  try {context = await requireDriveBrowser();}
  catch {return <p role="alert">Het Drive-overzicht is nog niet beschikbaar. Controleer de inrichting en toegangsrechten.</p>;}
  const {supabase, membership, rootId} = context;
  const options: {id: string; type: string; label: string}[] = [];
  for (const type of dossierEntityTypes) {
    const config = dossierEntityConfig[type];
    if (!hasPermission(membership, config.capability)) continue;
    const {data, error} = await supabase.from(config.table).select(`id,${config.titleColumn}`).eq('organization_id', membership.organization_id).is('deleted_at', null).order('updated_at', {ascending: false}).limit(200);
    if (error) return <p role="alert">De dossierkeuzes konden niet worden geladen. Probeer opnieuw.</p>;
    for (const row of data ?? []) {const value = row as unknown as Record<string, string>; options.push({id: value.id, type, label: `${config.label}: ${value[config.titleColumn]}`});}
  }
  return <DriveBrowserPanel rootId={rootId} options={options} linksEnabled={process.env.BESC_DOSSIER_LINKS_ENABLED === 'true'} previewEnabled={process.env.BESC_DOSSIER_LINKS_ENABLED === 'true'}/>;
}
