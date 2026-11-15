export const dossierLinkTypes = ['reference', 'publication', 'briefing', 'document', 'website', 'other', 'image', 'folder', 'application'] as const;
export type DossierLinkType = typeof dossierLinkTypes[number];
export const dossierLinkLabels: Record<DossierLinkType, string> = {
  reference: 'Referentie', publication: 'Publicatie', briefing: 'Briefing', document: 'Document',
  website: 'Website', other: 'Andere link', image: 'Afbeelding', folder: 'Map', application: 'Toepassing',
};
export function safeDossierLink(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
/** Preview requests are browser-only, omit credentials and never use a server proxy. */
export function imagePreviewUrl(value: string): string | null {
  if (!safeDossierLink(value)) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      /^\[|^[\d.]+$/.test(url.hostname) ||
      ['drive.google.com', 'docs.google.com'].includes(url.hostname)) return null;
  return url.href;
}

export function dossierImagePreviewSource(value: string): string {
  try {const url = new URL(value); const id = /^\/file\/d\/([A-Za-z0-9_-]{1,200})(?:\/view)?$/.exec(url.pathname)?.[1];
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password && id) return `/app/documenten/drive-preview/${id}`;
  } catch { /* The preview loader reports invalid external URLs without a request. */ }
  return value;
}
