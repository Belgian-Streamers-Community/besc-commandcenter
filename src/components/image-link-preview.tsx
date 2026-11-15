'use client';
/* eslint-disable @next/next/no-img-element -- Local object URLs are already bounded previews; never send private bytes to Next image optimization. */
import { useEffect, useId, useRef, useState } from 'react';
import { loadImageLinkPreview } from '@/lib/image-link-preview';
import './image-link-preview.css';

export function ImageLinkPreview({url, label}: {url: string; label: string}) {
  const id = useId(); const [open, setOpen] = useState(false); const [result, setResult] = useState<{url: string; src?: string; error?: string}>({url});
  const src = result.url === url ? result.src : undefined; const error = result.url === url ? result.error : undefined;
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000); let active = true; let objectUrl: string | undefined;
    loadImageLinkPreview(url, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setResult({url, src: objectUrl});
    }).catch(() => {if (active) setResult({url, error: 'Preview niet beschikbaar. Open de bron om de afbeelding te bekijken.'});});
    function dismiss(event: Event) {if (event instanceof KeyboardEvent ? event.key === 'Escape' : !container.current?.contains(event.target as Node)) setOpen(false);}
    document.addEventListener('keydown', dismiss); document.addEventListener('pointerdown', dismiss);
    return () => {active = false; controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss);};
  }, [open, url]);
  function show() {setResult({url}); setOpen(true);}
  return <span className="image-link-preview" ref={container} onMouseEnter={() => {if (!open) show();}} onMouseLeave={() => {if (!container.current?.contains(document.activeElement)) setOpen(false);}} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);}}>
    <button type="button" aria-expanded={open} aria-controls={id} aria-label={`Afbeeldingspreview: ${label}`} onFocus={() => {if (!open) show();}} onClick={() => {if (!open) show();}}>Bekijk afbeelding</button>
    {open && <span id={id} className="image-preview-card" role="region" aria-label={`Preview van ${label}`}>
      {src ? <img src={src} alt={label} onError={() => {setResult({url, error: 'Afbeelding kan niet worden weergegeven.'});}}/> : <span role="status">{error || 'Afbeelding laden…'}</span>}
      <button type="button" onClick={() => setOpen(false)}>Sluiten</button>
    </span>}
  </span>;
}
