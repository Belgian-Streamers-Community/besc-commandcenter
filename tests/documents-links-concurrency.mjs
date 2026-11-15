import assert from 'node:assert/strict';
import pg from 'pg';
if(process.env.F1_NATIVE_TEST!=='1'||process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Dedicated local fixture required');
const a=new pg.Client(),b=new pg.Client();await a.connect();await b.connect();
try{
 const {rows:[{org,admin,partner}]}=await a.query(`select o.id org,u.id admin,p.id partner from public.organizations o join auth.users u on u.email='admin@fixture.invalid' join public.partners p on p.organization_id=o.id where o.slug='besc' limit 1`);
 await b.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)`,[admin]);await b.query('set role authenticated');
 for(const commit of [true,false]){
  await a.query('begin');await a.query('update public.partners set deleted_at=clock_timestamp() where id=$1',[partner]);await b.query('begin');
  let settled=false;const pending=b.query(`insert into public.record_links(organization_id,entity_type,entity_id,label,url,link_type,created_by)values($1,'partner',$2,'TESTFIXTURE — NIET PUBLICEREN',$3,'folder',$4)`,[org,partner,'https://drive.google.com/drive/folders/race'+String(commit),admin]).then(value=>{settled=true;return {value,error:null};},error=>{settled=true;return {value:null,error};});
  let blocked=false;for(let n=0;n<100;n++){const {rows}=await a.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID]);if(rows[0]?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
  assert.ok(blocked,'Link insert must wait for concurrent archive');assert.equal(settled,false);await a.query(commit?'commit':'rollback');const result=await pending;
  if(commit){assert.equal(result.error?.code,'23514');assert.match(result.error.message,/extended_link_dossier_unavailable/);}else {assert.ifError(result.error);assert.equal(result.value?.rowCount,1);}
  await b.query('rollback');await a.query('update public.partners set deleted_at=null where id=$1',[partner]);console.log(commit?'PASS: concurrent committed archive rejects attachment':'PASS: rolled-back archive permits attachment');
 }
}finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
