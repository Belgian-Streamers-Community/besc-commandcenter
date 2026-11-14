import Link from 'next/link';
import type {InboxChoice,SyncRow,SyncDetail} from '@/lib/inbox-control';
import {InboxSyncStatus} from './inbox-sync-status';
import {controlSocialInbox} from '@/app/app/social/inbox/actions';

const feedback:Record<string,string>={created:'Leesronde voorbereid. Er zijn nog geen berichten opgehaald.',pending:'Pagina opgeslagen. Je kunt de volgende pagina ophalen.',completed:'Leesronde afgerond.',retry_wait:'Wachten op een nieuwe poging. De bevestigde voortgang blijft bewaard.',blocked:'Toegang of koppeling controleren.',attention:'Deze leesronde vraagt opvolging.',unconfirmed:'De uitkomst is niet bevestigd. Vernieuw eerst de status; herstart niet op goed geluk.',skipped:'Er is geen pagina verwerkt. Controleer de status of wachttijd.',cancelled:'Leesronde geannuleerd.',restarted:'Opnieuw beginnen is voorbereid. Bestaande berichten blijven bewaard.'};
export function InboxControls({enabled,choices,rows,detail,request,before,feedback:notice,error,eventsBefore}:{enabled:boolean;choices:InboxChoice[];rows:SyncRow[];detail:SyncDetail|null;request:string;before?:string;feedback?:string;error?:boolean;eventsBefore?:string}){
 if(!enabled)return<section className="inbox-controls"><h2>Berichten ophalen</h2><p>De ontvangst is nog niet ingeschakeld. Er worden geen berichten opgehaald.</p></section>;
 const hidden=(operation:string)=><><input type="hidden" name="operation" value={operation}/><input type="hidden" name="job" value={detail?.id??''}/><input type="hidden" name="revision" value={detail?.revision??0}/></>;
 const visible=detail?.events.slice(-50),oldest=visible?.[0];
 const now=detail?Date.parse(detail.observed_at):0;
 const ready=detail&&(detail.state==='pending'||detail.state==='processing'&&!!detail.lease_until&&Date.parse(detail.lease_until)<=now||detail.state==='retry_wait'&&Date.parse(detail.available_at)<=now);
 return <section className="inbox-controls" aria-label="Inboxontvangst bedienen"><h2>Berichten ophalen</h2><p>Elke klik haalt maximaal één pagina op. Er worden geen antwoorden verstuurd. Vernieuw de status na een onderbreking.</p>
  {notice&&feedback[notice]&&<p role="status">{feedback[notice]}</p>}{error&&<p role="alert">De bediening of status kon niet worden bevestigd. Vernieuw de pagina en controleer je toegang.</p>}
  <Link href="/app/social/inbox">Status vernieuwen</Link>
  {choices.length>0?<form action={controlSocialInbox}><input type="hidden" name="operation" value="start"/><input type="hidden" name="request" value={request}/><label>Account en soort ontvangst<select name="selection" required>{choices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label><button>Leesronde voorbereiden</button></form>:<p>Er is nog geen toegestane ontvangstselectie ingericht.</p>}
  <h3>Leesrondes</h3>{rows.length===0?<p>Er zijn nog geen leesrondes beschikbaar.</p>:<ul>{rows.slice(0,50).map(r=><li key={r.id}><Link href={'/app/social/inbox?sync_job='+encodeURIComponent(r.id)}>{choices.find(c=>c.target.account_id===r.account_id&&c.target.kind===r.kind)?.label??'Opgeslagen leesronde'} · {r.pages_committed} bevestigde pagina’s</Link></li>)}</ul>}
  {rows.length>50&&<Link href={'/app/social/inbox?sync_before='+encodeURIComponent(rows[49].id)}>Oudere leesrondes</Link>}{before&&<Link href="/app/social/inbox">Nieuwste leesrondes</Link>}
  {detail&&<><InboxSyncStatus jobs={[{...detail,events:visible}]}/>
   {ready&&<form action={controlSocialInbox}>{hidden('step')}<button>{detail.state==='processing'?'Hervatten na onderbreking':'Volgende pagina ophalen'}</button></form>}
   {!['completed','cancelled'].includes(detail.state)&&<form action={controlSocialInbox}>{hidden('cancel')}<button>Leesronde annuleren</button></form>}
   {detail.state!=='processing'&&<form action={controlSocialInbox}>{hidden('restart')}<label><input type="checkbox" name="confirm" value="yes" required/>Ik wil vanaf het begin herlezen. Bestaande berichten blijven bewaard.</label><button>Opnieuw beginnen voorbereiden</button></form>}
   {detail.events.length>50&&oldest&&<Link href={'/app/social/inbox?sync_job='+encodeURIComponent(detail.id)+'&sync_events_before='+oldest.id}>Eerdere ontvangsthistorie</Link>}{eventsBefore&&<Link href={'/app/social/inbox?sync_job='+encodeURIComponent(detail.id)}>Nieuwste ontvangsthistorie</Link>}
  </>}
 </section>;
}
