import 'server-only';
import { requirePermission } from '@/lib/auth-context';
import { hasPermission } from '@/lib/permissions';
import { googleAccessToken } from '@/lib/google-workspace';
import { createDriveBrowser, googleDriveBrowserPort } from '@/lib/drive-browser';

export async function requireDriveBrowser() {
  if (process.env.BESC_DRIVE_BROWSER_ENABLED !== 'true') throw Error('De Drive-mappenboom is nog niet ingeschakeld.');
  const context = await requirePermission('manageOrganization');
  // The shared root can contain financial and governance documents. Do not expose
  // it to a role that can manage only a single operational module.
  if (!hasPermission(context.membership, 'manageFinance') || context.membership.organization_id !== process.env.BESC_DRIVE_BROWSER_ORGANIZATION_ID) throw Error('Geen toegang tot de centrale Drive-mappenboom.');
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '';
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID ?? '';
  const token = () => googleAccessToken({scopes: ['https://www.googleapis.com/auth/drive.readonly'], signal: AbortSignal.timeout(15_000)});
  return {...context, rootId, token, browser: createDriveBrowser(googleDriveBrowserPort(token, driveId), {rootId, driveId})};
}
