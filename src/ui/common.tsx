// Small shared pieces of the interface: names, form controls and the panel frame.

import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StyleId } from '../catalogue/styles';
import { useStore } from '../state/store';

export const STYLE_SHORT: Record<StyleId, string> = {
  muji: 'Muji',
  japanese: 'Japanese',
  brutalist: 'Brutalist',
  minimal: 'Minimalist',
  quietLuxury: 'Quiet Luxury',
};

export const ROOM_NAMES: Record<string, string> = {
  living: 'Living',
  dining: 'Dining',
  kitchen: 'Kitchen',
  yard: 'Yard',
  bedroom1: 'Bedroom 1',
  bedroom2: 'Bedroom 2',
  study: 'Study',
  toilet1: 'Bathroom 1',
  toilet2: 'Bathroom 2',
  foyer: 'Foyer',
  balcony: 'Balcony',
  corridor: 'Hallway',
  ac1: 'AC ledge',
  ac2: 'AC ledge',
  common: 'Common corridor',
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassPoint = (azimuthDeg: number) => COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16]!;

export function formatClock(h: number): string {
  const total = Math.round(h * 60) % (24 * 60);
  const H = Math.floor(total / 60);
  const mm = total % 60;
  const suffix = H < 12 ? 'am' : 'pm';
  const h12 = H % 12 === 0 ? 12 : H % 12;
  return `${h12}:${String(mm).padStart(2, '0')}\u00a0${suffix}`;
}

export function PanelFrame({ family, icon: Icon, title, children, className = '' }: { family: string; icon: LucideIcon; title: string; children: ReactNode; className?: string }) {
  const set = useStore((s) => s.set);
  return (
    <aside className={`panel glass p-${family} ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span className="ptitle">
          <Icon className="ic" size={20} />
          {title}
        </span>
        <button className="iconbtn" aria-label="Close" onClick={() => set({ panel: null })}>
          <X className="ic" size={16} />
        </button>
      </header>
      <div className="pbody">{children}</div>
    </aside>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: LucideIcon }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.icon && <o.icon className="ic" size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Range({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format: (v: number) => string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <label className="field">
      <span className="row between">
        <span className="label">{label}</span>
        <span className="val small">{format(value)}</span>
      </span>
      <input className="range" type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${p}%` } as React.CSSProperties} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}
