import Link from 'next/link';
import {notFound} from 'next/navigation';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppShell} from '@/components/app-shell';
import {requireActiveMembership} from '@/lib/auth-context';
import {contactAnswer,mailAnswer,crmContactDiff,crmMatchCandidates} from '@/lib/crm-communication';
import {crmCommunicationAction} from './actions';
import {BoundedPanel,boundedGrantList} from './bounded-panel';
import {reviewGrants,crmVisibleConversationLinks,crmVisibleTarget} from '@/lib/crm-review';
import {ReviewPanel} from './review-panel';
export const dynamic='force-dynamic';

type Row={id:string;[key:string]:unknown};
const rows=(value:unknown)=>z.array(z.object({id:z.string()}).passthrough()).parse(value??[]) as Row[];
const text=(value:unknown)=>typeof value==='string'?value:'';
const labels:Record<string,string>={review:'Ter beoordeling',approved:'Goedgekeurd',claimed:'Verwerking gestart',dispatched:'Verzending aangevraagd',confirmed:'Door Gmail bevestigd',blocked:'Geblokkeerd vóór verzending',uncertain:'Uitkomst onzeker — niet opnieuw versturen',cancelled:'Geannuleerd',ready:'Klaar voor volgende pagina',done:'Geselecteerde leesronde afgerond',attention:'Opvolging nodig',same:'Gelijk',proposal:'Voorgestelde aanvulling',keep_local:'Lokaal behouden',conflict:'Conflict — bewust kiezen',source_deleted:'Verwijderd bij Google — lokaal behouden'};
function Action({connection,action,data={},children}:{connection:string;action:string;data?:Record<string,unknown>;children:React.ReactNode}){
 return <form action={crmCommunicationAction}><input type="hidden" name="connection" value={connection}/><input type="hidden" name="action" value={action}/><input type="hidden" name="data" value={JSON.stringify(data)}/>{children}</form>;
}
function Confirm({label}:{label:string}){return <label><input type="checkbox" name="confirmed" value="yes" required/>{label}</label>;}
function Entities({options,peopleOnly=false}:{options:{value:string;label:string;type:string}[];peopleOnly?:boolean}){
 return <label>Contact of dossier<select name="entity" required><option value="">Kies bewust een contact of dossier</option>{options.filter(o=>!peopleOnly||['community_person','partner'].includes(o.type)).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
export default async function CrmCommunicationWorkspace({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.BESC_CRM_COMMUNICATION_ENABLED!=='true')notFound();
 const {supabase,membership,user}=await requireActiveMembership();if(!['admin','board'].includes(membership.role))notFound();
 const query=await searchParams,org=membership.organization_id;
 const {data:connections,error:connectionError}=await supabase.rpc('crm_communication_owner',{p_org:org,p_action:'connections'});
 if(connectionError)return <AppShell active="Communicatie"><p role="alert">De communicatieverbindingen konden niet worden gecontroleerd.</p></AppShell>;
 const available=rows(connections),selected=available.find(c=>c.id===query.connection)??available[0];
 if(!selected)return <AppShell active="Communicatie"><h1>Contacten en communicatie</h1><p>Er is nog geen afzonderlijk vrijgegeven communicatieverbinding. Er worden geen mailboxen of contacten opgehaald.</p><Link href="/app/communicatie">Terug naar communicatie</Link></AppShell>;
 const {data:view,error}=await supabase.rpc('crm_communication_owner',{p_org:org,p_action:'overview',p_object:selected.id});
 if(error||!view)return <AppShell active="Communicatie"><p role="alert">Deze communicatiegegevens konden niet worden gecontroleerd. Voer geen nieuwe actie uit.</p></AppShell>;
 const overview=z.record(z.string(),z.unknown()).parse(view),incoming=rows(overview.incoming),outbox=rows(overview.outbox),runs=rows(overview.runs),points=rows(overview.points);
 const access=z.object({can_write:z.boolean(),can_approve:z.boolean()}).parse(overview.access),canWrite=access.can_write,canApprove=access.can_approve;
 const tables=[['community_person','community_people','display_name'],['partner','partners','name'],['project','projects','title'],['event','events','title'],['meeting','meetings','title'],['campaign','campaigns','title']] as const;
 const lookups=await Promise.all(tables.map(async([type,table,column])=>{
  const result=await supabase.from(table).select('id,updated_at,'+column+(type==='community_person'||type==='partner'?',email':'')).eq('organization_id',org).is('deleted_at',null).limit(201);
  return{type,column,...result};
 }));
 if(lookups.some(x=>x.error))return <AppShell active="Communicatie"><p role="alert">De gekoppelde dossiers of contacten konden niet geladen worden. Er is niets gewijzigd.</p></AppShell>;
 const options=lookups.flatMap(x=>rows(x.data).slice(0,200).map(r=>({value:`${x.type}|${r.id}|${text(r.updated_at)}`,label:`${x.type==='community_person'?'Persoon':x.type==='partner'?'Organisatie':x.type}: ${text(r[x.column])}`,type:x.type})));
 const people=rows(lookups.find(x=>x.type==='community_person')?.data),partners=rows(lookups.find(x=>x.type==='partner')?.data);
 const emails=await supabase.from('email_communications').select('id,title,status').eq('organization_id',org).is('deleted_at',null).in('status',['draft','changes_requested','failed']).order('updated_at',{ascending:false}).limit(50);
 const members=await supabase.from('organization_members').select('user_id,profiles(display_name)').eq('organization_id',org).eq('status','active');
 const gmail=selected.kind==='gmail';
 const bounded=process.env.BESC_CRM_BOUNDED_RECEIVE_ENABLED==='true'?await supabase.rpc('crm_bounded_owner',{p_org:org,p_action:'list'}):null;
 const boundedGrants=bounded&&!bounded.error?boundedGrantList.safeParse(bounded.data):null;
 const review=process.env.BESC_CRM_REVIEW_ENABLED==='true'?await supabase.rpc('crm_review_owner',{p_org:org,p_action:'list',p_connection:selected.id}):null;
 const reviews=review&&!review.error?reviewGrants.safeParse(review.data):null;
 return <AppShell active="Communicatie"><header className="topbar"><div><p>CONTACTEN EN COMMUNICATIE</p><h1>Gesprekken en contactgegevens</h1></div><Link href="/app/communicatie">Mailregister</Link></header>
  <div className="module-body"><nav aria-label="Communicatieverbindingen">{available.map(c=><Link key={c.id} href={'?connection='+c.id}>{c.kind==='gmail'?'Gmail':'Google Contacts'} · {text(c.owner_email)} </Link>)}</nav>
   <p>Alleen handmatige, geselecteerde verwerking. Een contact krijgt geen accounttoegang. Een mail wordt afzonderlijk beoordeeld voordat hij kan worden verzonden.</p>
   {query.fout&&<p className="error-note" role="alert">De actie is niet bevestigd. Controleer de opgeslagen status en historie voordat je opnieuw handelt.</p>}
   {query.succes&&<p role="status">De actie is opgeslagen. Controleer hieronder de nieuwe status.</p>}
   {bounded&&(bounded.error||!boundedGrants?.success)?<p role="alert">De tijdelijke ontvangstrechten konden niet worden gecontroleerd. Start geen ontvangst.</p>:boundedGrants?.success&&<BoundedPanel grants={boundedGrants.data.filter(g=>g.kind===selected.kind)}/>}
   {review&&(review.error||!reviews?.success)?<p role="alert">De tijdelijke beoordelingsrechten konden niet worden gecontroleerd. Voer geen beoordeling uit.</p>:reviews?.success&&<ReviewPanel grants={reviews.data.filter(g=>incoming.some(i=>i.id===g.incoming_id))} connection={selected.id} options={options}/>}
   {lookups.some(x=>(x.data?.length??0)>200)&&<p>De keuzelijst toont maximaal 200 dossiers per soort. Zoek een ontbrekend dossier eerst in zijn bestaande module; kies geen vervanging.</p>}
   <section className="form-card"><h2>Een leesronde voorbereiden</h2><p>Voorbereiden leest nog niets bij Google. Verwerk daarna één pagina per bewuste klik.</p>
    {canWrite&&<>
    <Action connection={selected.id} action="start" data={{request_id:randomUUID()}}><input type="hidden" name="kind" value={gmail?'gmail':'contacts'}/>
     {gmail?<><label>Gmail-gesprekscodes voor de beperkte proef (maximaal vijf)<input name="threads" required/></label><label>Inhoud<select name="format"><option value="metadata">Alleen kopgegevens</option><option value="full">Kopgegevens en platte tekst</option></select></label></>:<p>Google Contacts: uitsluitend opgeslagen contactbronnen, maximaal drie pagina’s voor de eerste ronde. Er wordt niets naar Google teruggeschreven.</p>}
     <button>Leesronde voorbereiden</button></Action></>}
    {runs.map(r=><article key={r.id}><h3>{labels[text(r.state)]??'Opvolging nodig'}</h3><p>{String(r.pages)} pagina’s opgeslagen.</p>
     {canWrite&&r.state==='ready'&&<><Action connection={selected.id} action="receive" data={{id:r.id}}><button>Eén pagina ophalen</button></Action><Action connection={selected.id} action="cancel_run" data={{run_id:r.id,revision:r.revision}}><button>Leesronde annuleren</button></Action></>}
     {canWrite&&r.state==='attention'&&<><Action connection={selected.id} action="resume_run" data={{run_id:r.id,revision:r.revision}}><Confirm label="De verbinding en selectie zijn opnieuw gecontroleerd; ik wil deze ronde bewust hervatten."/><button>Hervatten met behoud van voortgang</button></Action><Action connection={selected.id} action="cancel_run" data={{run_id:r.id,revision:r.revision}}><button>Leesronde stoppen zonder haar als volledig af te tekenen</button></Action></>}
    </article>)}
   </section>
   <section className="form-card"><h2>{gmail?'Geselecteerde gesprekken':'Contactvoorstellen'}</h2><p>Laatste 100 ontvangen items; een voorstel is nog geen koppeling of wijziging.</p>
    {incoming.map(item=>{
     if(gmail){const parsed=mailAnswer.safeParse(item.payload);if(!parsed.success)return <p key={item.id} role="alert">Een bericht kan niet veilig worden weergegeven.</p>;const m=parsed.data;
      const linked=crmVisibleConversationLinks(overview.links,selected.id,m.thread_id,options);
      return <article key={item.id}><h3>{m.subject||'Zonder onderwerp'}</h3><p>Van: {m.from} · {m.date}</p><p style={{whiteSpace:'pre-wrap'}}>{m.body||'Geen platte tekst opgehaald.'}</p>{m.has_attachments&&<p>Bijlagen zijn niet opgehaald.</p>}
       <div><h4>Gekoppelde contacten en dossiers</h4>{linked===null?<p role="alert">De gesprekskoppelingen konden niet veilig worden weergegeven.</p>:linked.length===0?<p>Dit gesprek is nog niet aan een contact of dossier gekoppeld.</p>:<ul>{linked.map(l=><li key={l.key}>{l.target?<Link href={l.target.href}>{l.target.label}</Link>:'Een gekoppeld contact of dossier is niet beschikbaar.'}</li>)}</ul>}<p>Een koppeling geldt voor het gesprek; er worden geen extra berichten opgehaald.</p></div>
       {canWrite&&<Action connection={selected.id} action="link_thread" data={{thread_id:m.thread_id}}><Entities options={options}/><button>Gesprek aan gekozen contact of dossier koppelen</button></Action>}
      </article>;
     }
     const parsed=contactAnswer.safeParse(item.payload);if(!parsed.success)return <p key={item.id} role="alert">Een contactvoorstel kan niet veilig worden weergegeven.</p>;const remote=parsed.data;
     const previous=item.previous_decision as {person_id?:string;partner_id?:string;base?:unknown}|null;
     const local=people.find(p=>p.id===previous?.person_id)??partners.find(p=>p.id===previous?.partner_id);
     const base=contactAnswer.safeParse(previous?.base);
     const decision=item.decision as {person_id?:string;partner_id?:string}|null;
     const decisionTarget=decision?crmVisibleTarget(decision.person_id?'community_person':'partner',decision.person_id??decision.partner_id??'',options):null;
     const localPoints=points.filter(p=>p.person_id===local?.id||p.partner_id===local?.id);
     const diff=crmContactDiff(base.success?base.data:null,{names:local?[text(local.display_name)||text(local.name)]:[],emails:[...(local?.email?[text(local.email)]:[]),...localPoints.filter(p=>p.kind==='email').map(p=>text(p.value))],phones:localPoints.filter(p=>p.kind==='phone').map(p=>text(p.value)),organizations:[]},remote);
     return <article key={item.id}><h3>{remote.names.join(', ')||'Contact zonder naam'}</h3><p>{remote.deleted?'Verwijderd bij Google — lokale gegevens blijven behouden':remote.emails.join(', ')}</p>
      <dl>{Object.entries(diff).map(([field,value])=><div key={field}><dt>{({names:'Naam',emails:'E-mail',phones:'Telefoon',organizations:'Organisatie'} as Record<string,string>)[field]}</dt><dd>{labels[value.state]} · lokaal: {value.local.join(', ')||'Niet ingevuld'} · Google: {value.remote.join(', ')||'Niet ingevuld'}</dd></div>)}</dl>
      {remote.emails.some(address=>crmMatchCandidates(address,people.map(p=>({id:p.id,email:text(p.email)||null}))).length>1)&&<p className="error-note">Meerdere bestaande personen gebruiken dit adres. Er wordt niets automatisch gekoppeld.</p>}
      {item.decision?<p>Deze versie is beoordeeld. {decisionTarget&&<>Bevestigd bij <Link href={decisionTarget.href}>{decisionTarget.label}</Link>. </>}Een gewijzigde Google-versie wordt opnieuw voorgelegd.</p>:!canWrite?<p>Je kunt dit voorstel lezen; toepassen vraagt afzonderlijke bevoegdheid.</p>:<>
       {!remote.deleted&&<Action connection={selected.id} action="contact_decide" data={{incoming_id:item.id,revision:item.revision,point_sets:points}}><Entities options={options} peopleOnly/>
        {[...remote.emails.map(value=>({kind:'email',value})),...remote.phones.map(value=>({kind:'phone',value}))].map(p=><label key={p.kind+p.value}><input type="checkbox" name="point" value={JSON.stringify(p)}/>{p.kind==='email'?'E-mail':'Telefoon'}: {p.value}</label>)}
        <Confirm label="Voeg alleen de gekozen contactpunten toe; behoud bestaande gegevens en rechten."/><button>Gekozen gegevens bij bestaand contact bewaren</button>
       </Action>}
       {!remote.deleted&&remote.names.length>0&&<details><summary>Bewust een nieuwe contactfiche maken</summary><Action connection={selected.id} action="contact_decide" data={{incoming_id:item.id,revision:item.revision}}><input type="hidden" name="create_person" value="yes"/>
        <label>Naam<select name="name">{remote.names.map(n=><option key={n}>{n}</option>)}</select></label>
        {[...remote.emails.map(value=>({kind:'email',value})),...remote.phones.map(value=>({kind:'phone',value}))].map(p=><label key={p.kind+p.value}><input type="checkbox" name="point" value={JSON.stringify(p)}/>{p.value}</label>)}
        <Confirm label="Maak één nieuwe contactfiche met deze gekozen gegevens, zonder accounttoegang."/><button>Nieuwe contactfiche maken</button></Action></details>}
       <Action connection={selected.id} action="contact_ignore" data={{incoming_id:item.id,revision:item.revision}}><button>Deze versie overslaan</button></Action>
      </>}
     </article>;
    })}
   </section>
   {gmail&&<>
    {canWrite&&<>
    <section className="form-card"><h2>Een mail voorbereiden</h2><Action connection={selected.id} action="compose"><Entities options={options.filter(o=>!['community_person'].includes(o.type))}/>
     <label>Aan<input name="to" list="crm-addresses" required/></label><datalist id="crm-addresses">{[...people,...partners].filter(p=>p.email).map(p=><option key={p.id} value={text(p.email)}>{text(p.display_name)||text(p.name)}</option>)}{points.filter(p=>p.kind==='email').map(p=><option key={p.id} value={text(p.value)}>Toegevoegd contactpunt</option>)}</datalist>
     <label>Cc<input name="cc"/></label><label>Bcc<input name="bcc"/></label><label>Onderwerp<input name="subject" required maxLength={240}/></label><label>Bericht<textarea name="body" required maxLength={20000}/></label>
     <Confirm label="Deze gekozen ontvangers en inhoud mogen als lokaal concept worden bewaard; er wordt nog niets verzonden."/><button>Concept bewaren</button></Action></section>
    <section className="form-card"><h2>Beoordeling aanvragen</h2>{emails.error?<p role="alert">Concepten konden niet worden geladen.</p>:<Action connection={selected.id} action="freeze"><label>Concept<select name="email_id" required><option value="">Kies een bestaand concept</option>{emails.data?.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
     <label>Antwoord op<select name="reply_to"><option value="">Nieuwe mail</option>{incoming.filter(i=>mailAnswer.safeParse(i.payload).success).map(i=><option key={i.id} value={i.id}>{text((i.payload as Record<string,unknown>).subject)}</option>)}</select></label>
     <Confirm label="Zet precies dit concept met de gekozen ontvangers en antwoordcontext vast voor een andere beoordelaar."/><button>Inhoud vastzetten en beoordeling aanvragen</button></Action>}</section></>}
    <section className="form-card"><h2>Verzending en opvolging</h2>{outbox.map(job=>{
     const snapshot=job.snapshot as {from:string;email:{subject:string;body_text:string;to_addresses:string[];cc_addresses:string[];bcc_addresses:string[]}};
     return <article key={job.id}><h3>{snapshot.email.subject} · {labels[text(job.state)]}</h3><details><summary>Vastgelegde inhoud en ontvangers bekijken</summary><p>Van: {snapshot.from}</p><p>Aan: {snapshot.email.to_addresses.join(', ')}</p><p>Cc: {snapshot.email.cc_addresses.join(', ')}</p><p>Bcc: {snapshot.email.bcc_addresses.join(', ')}</p><p style={{whiteSpace:'pre-wrap'}}>{snapshot.email.body_text}</p></details>
      {['claimed','dispatched','uncertain'].includes(text(job.state))&&<p className="error-note">De mail kan al verzonden zijn. Start geen nieuwe verzending. Laat eerst de externe uitkomst controleren.</p>}
      {canApprove&&job.state==='review'&&job.requested_by!==user.id&&<><Action connection={selected.id} action="approve" data={{job_id:job.id,decision:'approve'}}><button>Deze versie goedkeuren</button></Action><Action connection={selected.id} action="approve" data={{job_id:job.id,decision:'reject'}}><button>Deze versie weigeren</button></Action></>}
      {canWrite&&['review','approved','blocked'].includes(text(job.state))&&job.requested_by===user.id&&<Action connection={selected.id} action="cancel_mail" data={{job_id:job.id}}><button>Intrekken vóór verzending</button></Action>}
      {canWrite&&job.state==='approved'&&<Action connection={selected.id} action="send" data={{id:job.id}}><button>De goedgekeurde mail eenmaal verzenden</button></Action>}
      {canWrite&&job.state==='confirmed'&&!job.follow_up_task&&<Action connection={selected.id} action="follow_up" data={{job_id:job.id}}><label>Opvolgtaak<input name="title" required maxLength={180}/></label><label>Verantwoordelijke<select name="assignee" required><option value="">Kies een verantwoordelijke</option>{members.data?.map(m=><option key={m.user_id} value={m.user_id}>{(Array.isArray(m.profiles)?m.profiles[0]:m.profiles as {display_name:string}|null)?.display_name??'Bestaand account'}</option>)}</select></label><label>Opvolgmoment<input name="due_at" type="datetime-local"/></label><Confirm label="Maak deze taak met de gekozen verantwoordelijke en datum."/><button>Opvolgtaak maken</button></Action>}
      {Boolean(job.follow_up_task)&&<Link href={'/app/taken/'+text(job.follow_up_task)}>Opvolgtaak openen</Link>}
     </article>;
    })}</section>
   </>}
   <section className="form-card"><h2>Historie</h2>{z.array(z.object({operation:z.string(),created_at:z.string()})).parse(overview.events??[]).map((event,i)=><p key={i}>{({submitted:'Beoordeling aangevraagd',approved:'Goedgekeurd',rejected:'Geweigerd',claimed:'Verwerking gestart',mail_dispatch:'Verzending aangevraagd',mail_complete:'Verzending bevestigd',mail_uncertain:'Uitkomst onzeker',page_committed:'Ontvangstpagina opgeslagen',contact_decide:'Contactpunten gekozen',contact_ignore:'Contactversie overgeslagen',follow_up_created:'Opvolgtaak gemaakt',contact_confirmed_existing:'Bestaand contact bevestigd zonder aanvullingen',thread_linked:'Gesprek aan dossier gekoppeld',review_granted:'Tijdelijke beoordeling vrijgegeven',review_stopped:'Tijdelijke beoordeling ingetrokken'} as Record<string,string>)[event.operation]??'Beheeractie vastgelegd'} · {event.created_at}</p>)}</section>
   {membership.role==='admin'&&<section className="form-card"><h2>Verbinding sluiten</h2><Action connection={selected.id} action="disable"><Confirm label="Stop nieuwe verwerking via deze verbinding; bewaar de bestaande gegevens en historie."/><button>Deze verbinding sluiten</button></Action></section>}
  </div></AppShell>;
}
