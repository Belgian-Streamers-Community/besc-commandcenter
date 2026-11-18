import {z} from 'zod';

export const reviewGrants=z.array(z.object({
 id:z.uuid(),incoming_id:z.uuid(),entity_type:z.enum(['community_person','project']),entity_id:z.uuid(),
 state:z.enum(['ready','done','cancelled']),expires_at:z.string(),can_execute:z.boolean(),can_stop:z.boolean(),
}));
export type ReviewGrant=z.infer<typeof reviewGrants>[number];
export type CrmEntityOption={value:string;label:string;type:string};
const roots:Record<string,string>={community_person:'community',partner:'sponsors',project:'projecten',event:'events',meeting:'vergaderingen',campaign:'campagnes'};
export function crmVisibleTarget(type:string,id:string,options:CrmEntityOption[]){
 if(!z.uuid().safeParse(id).success||!Object.hasOwn(roots,type))return null;
 const target=options.find(x=>x.type===type&&x.value.split('|')[1]===id);
 return target?{label:target.label,href:'/app/'+roots[type]+'/'+id}:null;
}
const threadLinks=z.array(z.object({connection_id:z.uuid(),thread_id:z.string().min(1).max(256),entity_type:z.string(),entity_id:z.uuid()}).passthrough());
export function crmVisibleConversationLinks(raw:unknown,connection:string,thread:string,options:CrmEntityOption[]){
 const parsed=threadLinks.safeParse(raw??[]);
 if(!parsed.success)return null;
 return parsed.data.filter(x=>x.connection_id===connection&&x.thread_id===thread).map(x=>({key:x.entity_type+':'+x.entity_id,target:crmVisibleTarget(x.entity_type,x.entity_id,options)}));
}
