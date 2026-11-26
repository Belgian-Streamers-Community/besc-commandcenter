import { OperationalModulePage } from "@/components/operational-module-page";
import Link from 'next/link';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {membership}=await requireActiveMembership();
 const inbox=process.env.BESC_SOCIAL_INBOX_ENABLED==='true'&&hasPermission(membership,'manageInbox');
 const importer=membership.role==='admin'||membership.role==='board';
 return <>{(inbox||importer)&&<nav aria-label="Social planning extra">{inbox&&<Link href="/app/social/inbox">Socialinbox openen</Link>}{inbox&&importer&&' · '}{importer&&<Link href="/app/social/importeren">Historiek importeren</Link>}</nav>}<OperationalModulePage module="social" searchParams={searchParams}/></>;
}
