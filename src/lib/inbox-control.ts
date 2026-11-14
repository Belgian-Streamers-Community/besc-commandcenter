import {z} from 'zod';
import {metaInboxSelection} from './meta-inbox-protocol.ts';
import {initialInboxCheckpoint} from './resumable-inbox-page.ts';

export const inboxReceiveEnabled=(env:Record<string,string|undefined>)=>env.BESC_SOCIAL_INBOX_ENABLED==='true'&&env.BESC_SOCIAL_INBOX_RECEIVE_ENABLED==='true';
const version=z.string().regex(/^v\d+\.\d+$/);
const choice=z.object({key:z.string().regex(/^[a-z0-9-]{1,60}$/),label:z.string().trim().min(1).max(100),target:metaInboxSelection}).strict();
export type InboxChoice=z.infer<typeof choice>;
export function inboxChoices(raw:string|undefined,organization:string):InboxChoice[]{
 const items=z.array(choice).max(20).parse(JSON.parse(raw||'[]'));
 if(new Set(items.map(i=>i.key)).size!==items.length||new Set(items.map(i=>i.target.account_id+':'+i.target.kind)).size!==items.length)throw Error('inbox_configuration');
 return items.filter(i=>i.target.organization_id===organization);
}
export const syncEvent=z.object({id:z.coerce.number().int().positive().safe(),operation:z.string(),reason:z.string().nullable(),created_at:z.string()});
export const syncRow=z.object({id:z.uuid(),account_id:z.uuid(),kind:z.enum(['direct','comment']).optional(),state:z.enum(['pending','processing','retry_wait','blocked','attention','completed','cancelled']),revision:z.number().int().nonnegative().safe(),pages_committed:z.number().int().nonnegative().safe(),attempts:z.number().int().nonnegative().safe(),reason:z.string().nullable(),available_at:z.string(),created_at:z.string().optional()});
export const syncDetail=syncRow.extend({selection:metaInboxSelection,api_version:version,observed_at:z.iso.datetime({offset:true}),lease_until:z.string().nullable().optional(),events:z.array(syncEvent).max(51)});
export type SyncRow=z.infer<typeof syncRow>;
export type SyncDetail=z.infer<typeof syncDetail>;
export type OwnerPort=(action:string,job?:string|null,data?:Record<string,unknown>)=>Promise<unknown>;
const revision=z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const inboxCommand=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('start'),selection:z.string().min(1).max(60),request:z.uuid()}),
 z.object({operation:z.literal('step'),job:z.uuid(),revision}),
 z.object({operation:z.literal('cancel'),job:z.uuid(),revision}),
 z.object({operation:z.literal('restart'),job:z.uuid(),revision,confirm:z.literal('yes')}),
]);
export async function controlInbox(input:unknown,ports:{enabled:boolean;organization:string;apiVersion:string;choices:InboxChoice[];owner:OwnerPort;step:(job:string)=>Promise<{state:string}>}){
 if(!ports.enabled)throw Error('inbox_disabled');const command=inboxCommand.parse(input);
 if(command.operation==='start'){
  const selected=ports.choices.find(c=>c.key===command.selection);if(!selected||selected.target.organization_id!==ports.organization)throw Error('inbox_selection_denied');
  const target=selected.target;
  const result=z.object({id:z.uuid(),state:z.string()}).parse(await ports.owner('create',null,{target,checkpoint:initialInboxCheckpoint(target,version.parse(ports.apiVersion)),request_id:command.request}));
  return{job:result.id,status:'created'};
 }
 const detail=syncDetail.parse(await ports.owner('read',command.job));
 if(detail.id!==command.job||detail.selection.organization_id!==ports.organization||detail.account_id!==detail.selection.account_id)throw Error('inbox_access_denied');
 if(detail.revision!==command.revision)throw Error('inbox_revision_changed');
 if(command.operation==='step')return{job:detail.id,status:(await ports.step(detail.id)).state};
 const data=command.operation==='restart'?{revision:detail.revision,checkpoint:initialInboxCheckpoint(detail.selection,detail.api_version)}:{revision:detail.revision};
 const result=z.object({id:z.uuid(),state:z.enum(['pending','cancelled'])}).parse(await ports.owner(command.operation,detail.id,data));
 if(result.id!==detail.id||result.state!==(command.operation==='cancel'?'cancelled':'pending'))throw Error('inbox_unconfirmed');
 return{job:detail.id,status:command.operation==='cancel'?'cancelled':'restarted'};
}
