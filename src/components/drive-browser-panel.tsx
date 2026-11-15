'use client';
import { useRef, useState } from 'react';
import { readDriveBrowserPage, linkDriveBrowserFile } from '@/app/app/documenten/drive-actions';
import { driveBrowserKind, driveBrowserUrl, type DriveBrowserFile, type DriveBrowserPage } from '@/lib/drive-browser';
import { ImageLinkPreview } from '@/components/image-link-preview';
import './drive-browser-panel.css';

type Option = {id: string; type: string; label: string};
type ReadPage = typeof readDriveBrowserPage;
function Folder({id, name, ancestors, readPage, select}: {id: string; name: string; ancestors: string[]; readPage: ReadPage; select(file: DriveBrowserFile): void}) {
  const [open, setOpen] = useState(false); const [page, setPage] = useState<DriveBrowserPage>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const serial = useRef(0); const tokens = useRef(new Set<string>());
  async function load(more = false) {
    const request = ++serial.current; setBusy(true); setError('');
    try {
      const token = more ? page?.nextPageToken ?? undefined : undefined;
      if (token && tokens.current.has(token)) throw Error('Herhaalde vervolgpagina. Vernieuw de map.');
      const result = await readPage(id, token);
      if (request !== serial.current) return;
      if (more && token) tokens.current.add(token); else tokens.current.clear();
      setPage({...result, incomplete: result.incomplete || (more && page?.incomplete) || false, files: more && page ? [...new Map([...page.files, ...result.files].map(file => [file.id, file])).values()] : result.files});
    } catch {if (request === serial.current) setError('Map niet bijgewerkt. Controleer de rechten of probeer opnieuw. Eerder geladen gegevens kunnen verouderd zijn.');}
    finally {if (request === serial.current) setBusy(false);}
  }
  return <li>
    <button type="button" aria-expanded={open} onClick={() => {setOpen(!open); if (!open && !page) void load();}}>{open ? '▾' : '▸'} {name}</button>
    {open && <div className="drive-folder-content">
      {page && <p className="drive-checked">Gecontroleerd {new Date(page.checkedAt).toLocaleString('nl-BE')} <button type="button" disabled={busy} onClick={() => void load()}>Vernieuwen</button> <button type="button" onClick={() => select(page.folder)}>Deze map kiezen</button></p>}
      {busy && <p role="status">Map laden…</p>}{error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => void load()}>Opnieuw proberen</button></p>}
      {page?.incomplete && <p role="status">Drive meldt onvolledige resultaten. Dit overzicht is geen volledige inventaris.</p>}
      {page && !page.files.length && !page.nextPageToken && !page.incomplete && <p>Deze map is leeg.</p>}
      <ul>{page?.files.map(file => driveBrowserKind(file) === 'folder' ? ancestors.includes(file.id) || ancestors.length >= 39 ? <li key={file.id}>Mappad niet beschikbaar.</li> : <Folder key={file.id} id={file.id} name={file.name} ancestors={[...ancestors, file.id]} readPage={readPage} select={select}/> : <li key={file.id}><span>{file.name}</span> {file.mimeType === 'application/vnd.google-apps.shortcut' ? <span>Snelkoppeling — open in Drive</span> : <button type="button" onClick={() => select(file)}>Kiezen</button>} <a href={driveBrowserUrl(file)} target="_blank" rel="noreferrer">Open in Drive</a></li>)}</ul>
      {page?.nextPageToken && <button type="button" disabled={busy} onClick={() => void load(true)}>Meer laden</button>}
    </div>}
  </li>;
}

export function DriveBrowserPanel({rootId, options, linksEnabled, previewEnabled, readPage = readDriveBrowserPage}: {rootId: string; options: Option[]; linksEnabled: boolean; previewEnabled: boolean; readPage?: ReadPage}) {
  const [file, setFile] = useState<DriveBrowserFile>(); const [target, setTarget] = useState('');
  const selected = options.find(option => `${option.type}:${option.id}` === target);
  return <section className="drive-browser form-card" aria-label="Drive-mappenboom">
    <h2>Drive-mappenboom</h2><p>Open een map om de inhoud te lezen. Dit verplaatst of wijzigt geen bestanden in Google Drive. Rechten op Drive blijven gelden.</p>
    <ul><Folder id={rootId} name="BESC-documenten" ancestors={[rootId]} readPage={readPage} select={setFile}/></ul>
    {file && <div className="drive-selection"><h3>Gekozen: {file.name}</h3><a href={driveBrowserUrl(file)} target="_blank" rel="noreferrer">Open bron</a>
      {previewEnabled && driveBrowserKind(file) === 'image' && <ImageLinkPreview url={`/app/documenten/drive-preview/${file.id}`} label={file.name}/>}
      {linksEnabled ? <form action={linkDriveBrowserFile}><input type="hidden" name="file_id" value={file.id}/><input type="hidden" name="entity_type" value={selected?.type ?? ''}/><input type="hidden" name="entity_id" value={selected?.id ?? ''}/>
        <label>Dossier<select required value={target} onChange={event => setTarget(event.target.value)}><option value="">Kies een dossier</option>{options.map(option => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}</select></label>
        <p>Maximaal 200 recente dossiers per soort. Staat het dossier er niet bij? Voeg de bronlink rechtstreeks in dat dossier toe.</p><button type="submit" disabled={!selected}>Als dossierlink opslaan</button>
      </form> : <p>Dossierkoppelingen zijn nog niet ingeschakeld.</p>}
      <button type="button" onClick={() => setFile(undefined)}>Keuze sluiten</button>
    </div>}
  </section>;
}
