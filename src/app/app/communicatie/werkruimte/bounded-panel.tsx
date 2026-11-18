import {z} from 'zod';
import {boundedReceiveAction} from './bounded-actions';
export const boundedGrantList=z.array(z.object({id:z.uuid(),state:z.enum(['ready','claimed','done','attention','cancelled']),expires_at:z.string(),kind:z.enum(['contacts','gmail']),can_receive:z.boolean(),can_stop:z.boolean()}));
export function BoundedPanel({grants}:{grants:z.infer<typeof boundedGrantList>}){
 return <section className="form-card"><h2>Afgebakende ontvangstproef</h2><p>Alleen vooraf geselecteerde gegevens: maximaal één contact of één mail met kopgegevens. Dit recht staat toepassen, koppelen en verzenden niet toe.</p>
  {grants.length===0&&<p>Er is geen tijdelijke ontvangstproef voor jouw sessie vrijgegeven.</p>}
  {grants.map(g=><article key={g.id}><h3>{g.kind==='contacts'?'Eén Google-contact':'Eén Gmail-bericht met kopgegevens'}</h3>
   <p>{({ready:'Klaar voor één ontvangstpoging',claimed:'Poging gestart — controleer de status; haal niet opnieuw op',done:'Ontvangst bevestigd',attention:'Uitkomst controleren; niet opnieuw ophalen',cancelled:'Proef gestopt'})[g.state]}</p>
   <p>Tijdelijk recht tot {g.expires_at}</p>
   {g.state==='ready'&&g.can_receive&&<form action={boundedReceiveAction}><input type="hidden" name="grant" value={g.id}/><input type="hidden" name="action" value="receive"/><button>Geselecteerd item eenmaal ontvangen</button></form>}
   {g.can_stop&&<form action={boundedReceiveAction}><input type="hidden" name="grant" value={g.id}/><input type="hidden" name="action" value="stop"/><button>Tijdelijk ontvangstrecht intrekken</button></form>}
  </article>)}
 </section>;
}
