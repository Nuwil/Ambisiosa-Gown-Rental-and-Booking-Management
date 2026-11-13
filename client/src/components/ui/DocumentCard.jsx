import { useEffect, useState } from 'react';
import { cx } from '../../lib/format.js';
import { Badge } from './Display.jsx';
import Icon from './Icon.jsx';

function Preview({ url, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <button aria-label="Close" className="absolute right-4 top-4 bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20" onClick={onClose}><Icon name="close" className="h-5 w-5" /></button>
      <img src={url} alt={title} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/**
 * Framed container for an uploaded document image (Valid ID, signed contract, ...).
 * `url` is the image URL, or empty when nothing has been uploaded. Click the image to view it full screen.
 */
export default function DocumentCard({ title, icon = 'id-card', url, emptyHint, className }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const has = !!url && !failed;

  return (
    <section className={cx('card flex flex-col', className)} aria-label={title}>
      <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-4">
        <h2 className="eyebrow">{title}</h2>
        <Badge dot tone={has ? 'green' : failed ? 'red' : 'gray'}>{has ? 'On file' : failed ? 'Unreadable' : 'Not uploaded'}</Badge>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        {has ? (
          <button type="button" onClick={() => setOpen(true)} aria-label={`View ${title} full screen`}
            className="group relative block min-h-[14rem] w-full flex-1 cursor-zoom-in overflow-hidden border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">
            <img src={url} alt={title} loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.02]" />
            <span className="absolute bottom-2 right-2 flex items-center gap-1.5 border border-slate-200 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
              <Icon name="expand" className="h-3.5 w-3.5" />View
            </span>
          </button>
        ) : (
          <div className="flex min-h-[14rem] w-full flex-1 flex-col items-center justify-center gap-2 border border-dashed border-slate-300 px-6 text-center dark:border-slate-700">
            <Icon name={icon} className="h-7 w-7 text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{failed ? 'The image could not be loaded.' : emptyHint || 'Nothing uploaded yet.'}</p>
          </div>
        )}
      </div>
      {open && <Preview url={url} title={title} onClose={() => setOpen(false)} />}
    </section>
  );
}
