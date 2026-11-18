import Link from 'next/link';
import {crmVisibleTarget,type ReviewGrant,type CrmEntityOption} from '@/lib/crm-review';
import {crmReviewAction} from './review-actions';

export function ReviewPanel({grants,connection,options}:{grants:ReviewGrant[];connection:string;options:CrmEntityOption[]}){
 return <section className="form-card"><h2>Geselecteerde beoordeling</h2>
  <p>Alleen een vooraf vastgelegd bestaand contact bevestigen of een gesprek aan een project koppelen. Geen gegevens aanvullen of bij Google ophalen.</p>
  {grants.length===0&&<p>Geen tijdelijke beoordeling voor jouw sessie vrijgegeven.</p>}
  {grants.map(g=>{const target=crmVisibleTarget(g.entity_type,g.entity_id,options);return <article key={g.id}>
   <h3>{g.entity_type==='community_person'?'Bestaand contact bevestigen zonder aanvullingen':'Gesprek aan gekozen project koppelen'}</h3>
   <p>{target?<Link href={target.href}>{target.label}</Link>:'Het gekozen contact of dossier is niet beschikbaar. Voer geen beoordeling uit.'}</p>
   <p>{g.state==='done'?'Beoordeling bevestigd':g.state==='cancelled'?'Beoordeling ingetrokken':'Tijdelijke beoordeling'} · geldig tot {g.expires_at}</p>
   {g.state==='ready'&&g.can_execute&&target&&<form action={crmReviewAction}>
    <input type="hidden" name="connection" value={connection}/><input type="hidden" name="grant" value={g.id}/><input type="hidden" name="action" value="execute"/>
    <label><input type="checkbox" name="confirmed" value="yes" required/>{g.entity_type==='community_person'?'Behoud alle bestaande contactgegevens en accountrechten.':'Koppel alleen dit geselecteerde gesprek; wijzig het project niet.'}</label>
    <button>{g.entity_type==='community_person'?'Bestaand contact bevestigen':'Geselecteerde gesprekskoppeling bewaren'}</button>
   </form>}
   {g.can_stop&&<form action={crmReviewAction}><input type="hidden" name="connection" value={connection}/><input type="hidden" name="grant" value={g.id}/><input type="hidden" name="action" value="stop"/><button>Tijdelijk beoordelingsrecht intrekken</button></form>}
  </article>;})}
 </section>;
}
