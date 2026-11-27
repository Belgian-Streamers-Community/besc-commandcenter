import { OperationalModulePage } from "@/components/operational-module-page";
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {membership}=await requireActiveMembership();
 const inbox=process.env.BESC_SOCIAL_INBOX_ENABLED==='true'&&hasPermission(membership,'manageInbox');
 const importer=membership.role==='admin'||membership.role==='board';
 const headerLinks=[...(inbox?[{href:'/app/social/inbox',label:'Socialinbox openen'}]:[]),...(importer?[{href:'/app/social/importeren',label:'Historiek importeren'}]:[])];
 return <OperationalModulePage module="social" searchParams={searchParams} headerLinks={headerLinks}/>;
}
