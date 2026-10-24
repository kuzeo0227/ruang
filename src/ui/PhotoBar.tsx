// Photo Mode's controls: the button that opens it, and the bar showing the path tracer's progress
// with Save and Close.

import { AlertTriangle, Camera, Check, Download, X } from 'lucide-react';
import { useEffect } from 'react';
import { STYLES } from '../catalogue/styles';
import { UNITS } from '../plan/units';
import { PHOTO_SAMPLES } from '../render/PhotoMode';
import { registry } from '../render/registry';
import { useStore } from '../state/store';
import { formatClock } from './common';

export function openPhoto() {
  const s = useStore.getState();
  if (s.photo || s.mode === 'plan' || !s.started) return;
  s.set({ photo: { status: 'preparing', denoised: false, progress: 0, samples: 0, target: PHOTO_SAMPLES }, panel: null, measuring: false });
}

function savePhoto() {
  const s = useStore.getState();
  const name = `Ruang ${UNITS[s.unit].name} ${STYLES[s.style].name} ${formatClock(s.time).replace(':', '.')}.png`;
  registry.photoSave = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };
}

export function PhotoButton() {
  const plan = useStore((s) => s.mode === 'plan');
  return (
    <button className="cta photo-btn" onClick={openPhoto} disabled={plan} title="A path-traced photo of this view (P)" aria-label="Photo Mode">
      <Camera className="ic" size={17} />
      <span className="hide-phone">Photo</span>
    </button>
  );
}

export function PhotoBar() {
  const photo = useStore((s) => s.photo);
  const open = photo !== null;
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().set({ photo: null });
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [open]);
  if (!photo) return null;

  const share = photo.status === 'preparing' ? photo.progress : photo.samples / photo.target;
  const label =
    photo.status === 'preparing'
      ? `Preparing the scene · ${Math.round(photo.progress * 100)}%`
      : photo.status === 'rendering'
        ? `Tracing light · ${Math.floor(photo.samples)} of ${photo.target} samples`
        : photo.status === 'denoising'
          ? 'Denoising the final image'
          : photo.status === 'done'
            ? `Finished · ${photo.target} samples${photo.denoised ? ', denoised' : ''}`
            : 'The path tracer could not start on this device';
  return (
    <div className="photobar glass" role="status">
      <div className="pb-main">
        <span className="pb-title tabular">
          {photo.status === 'done' ? <Check className="ic" size={16} /> : photo.status === 'failed' ? <AlertTriangle className="ic" size={16} /> : <span className="spinner" />}
          {label}
        </span>
        <div className="pb-meter">
          <i style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>
      <button className="cta" onClick={savePhoto} disabled={photo.status === 'preparing' || photo.status === 'failed'}>
        <Download className="ic" size={16} />
        Save
      </button>
      <button className="ghostbtn" onClick={() => useStore.getState().set({ photo: null })} aria-label="Close Photo Mode">
        <X className="ic" size={16} />
        <span className="hide-phone">Close</span>
      </button>
    </div>
  );
}
