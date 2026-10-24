// Side panels (bottom sheets on phones): unit, style, lighting, views and settings.

import { Building2, Check, Copy, House, Lightbulb, Lock, Mountain, Palette, Power, Settings, Sun, Moon, SunMoon, Sunrise, Sunset, Trees, Tv, Waves, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Color } from 'three';
import { MATERIALS } from '../catalogue/materials';
import { STYLES, STYLE_ORDER } from '../catalogue/styles';
import { UNITS } from '../plan/units';
import type { RoomId, UnitTypeId } from '../plan/types';
import { kelvinColor } from '../render/Lighting';
import { controls } from '../render/Player';
import { registry } from '../render/registry';
import { DUSK_ELEVATION, KELVINS, applyLightScene, lightRooms, roomLight, setRoomLight, toggleRooms, useLitRooms, type LitRoom } from '../render/roomLights';
import { sunPosition, sunTimes } from '../render/sun';
import { useStore, writeSetting, type LightScene, type Quality, type RoomLight, type ViewId } from '../state/store';
import { PanelFrame, Range, Seg, Switch, compassPoint, formatClock } from './common';
import { FurniturePanel } from './FurniturePanel';

export function PanelHost() {
  const panel = useStore((s) => s.panel);
  switch (panel) {
    case 'unit':
      return <UnitPanel />;
    case 'style':
      return <StylePanel />;
    case 'furniture':
      return <FurniturePanel />;
    case 'lighting':
      return <LightingPanel />;
    case 'views':
      return <ViewsPanel />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return null;
  }
}

// ---------------- Unit ----------------

const UNIT_LIST: { id: UnitTypeId; summary: string; soon?: string }[] = [
  { id: 'A', summary: '2 bedrooms + study · 2 bathrooms' },
  { id: 'B1', summary: '3 bedrooms · bay window · 2 bathrooms', soon: 'Phase 4' },
  { id: 'B', summary: '3 bedrooms · 2 bathrooms', soon: 'Phase 4' },
];

function UnitPanel() {
  const unit = useStore((s) => s.unit);
  return (
    <PanelFrame family="unit" icon={House} title="Unit type">
      <div className="block">
        {UNIT_LIST.map((u) => {
          const plan = UNITS[u.id];
          return (
            <div key={u.id} className={`listcard ${u.id === unit ? 'on' : ''} ${u.soon ? 'locked' : ''}`}>
              <div className="lc-main">
                <b>{plan.name}</b>
                <span>{u.summary}</span>
              </div>
              <div className="lc-side">
                <b className="tabular">{plan.schedule.totalSqft} sq ft</b>
                <span className="tabular">{plan.schedule.totalM2.toFixed(1)} m²</span>
              </div>
              {u.soon ? <span className="soon-tag">{u.soon}</span> : u.id === unit ? <Check className="ic tick" size={18} /> : null}
            </div>
          );
        })}
      </div>
      <p className="note">Ceilings 2.75 m. Balcony faces north. Room sizes follow the CAD schedule.</p>
    </PanelFrame>
  );
}

// ---------------- Style ----------------

function StylePanel() {
  const style = useStore((s) => s.style);
  const loading = useStore((s) => s.loading);
  const set = useStore((s) => s.set);
  return (
    <PanelFrame family="style" icon={Palette} title="Interior style">
      <div className="block">
        {STYLE_ORDER.map((id) => {
          const st = STYLES[id];
          const on = id === style;
          const floor = MATERIALS[st.shell.floor].name;
          const tier = Math.min(3, Math.max(1, Math.round(st.tier) + 1));
          return (
            <button key={id} className={`stylecard ${on ? 'on' : ''}`} onClick={() => set({ style: id })}>
              <div className="sc-pal">
                {st.palette.map((p) => (
                  <i key={p.name} style={{ background: p.hex }} title={p.name} />
                ))}
              </div>
              <div className="sc-body">
                <b>{st.name}</b>
                <span>{st.tagline}</span>
                <span className="sc-meta">
                  {floor} floor · {st.lightKelvin} K lights
                  <span className="tier" title="Furniture price level">
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={n <= tier ? 'on' : ''}>RM</i>
                    ))}
                  </span>
                </span>
              </div>
              {on && (loading.done ? <Check className="ic tick" size={18} /> : <span className="spinner" aria-label="Loading" />)}
            </button>
          );
        })}
      </div>
      <p className="note">A style changes the furniture and the finishes of floors, walls, doors, frames and hardware. Your edits are kept for each style.</p>
    </PanelFrame>
  );
}

// ---------------- Lighting ----------------

const T_MIN = 5;
const T_MAX = 24;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function todGradient(sunrise: number, sunset: number) {
  const stops: [number, string][] = [
    [T_MIN, '#141a33'],
    [sunrise - 0.7, '#2b2f5c'],
    [sunrise, '#f59e8b'],
    [sunrise + 1, '#9ad7f7'],
    [12.5, '#7cc7f5'],
    [sunset - 2.5, '#ffd27a'],
    [sunset - 0.4, '#ff9f5a'],
    [sunset + 0.3, '#9b6bd6'],
    [sunset + 1.2, '#1e2a4a'],
    [T_MAX, '#121a33'],
  ];
  return `linear-gradient(90deg, ${stops.map(([t, c]) => `${c} ${(((t - T_MIN) / (T_MAX - T_MIN)) * 100).toFixed(1)}%`).join(', ')})`;
}

const LIGHT_SCENES: { id: LightScene; label: string; icon: LucideIcon }[] = [
  { id: 'auto', label: 'Auto', icon: SunMoon },
  { id: 'evening', label: 'Evening', icon: Sunset },
  { id: 'movie', label: 'Movie', icon: Tv },
  { id: 'allOn', label: 'All on', icon: Lightbulb },
  { id: 'allOff', label: 'All off', icon: Power },
];

/** The colour a light of this temperature looks, for the swatch. */
const WHITE = new Color(1, 1, 1);
const kelvinCss = (k: number) => `#${kelvinColor(k).lerp(WHITE, 0.18).getHexString()}`;
const nextKelvin = (k: number) => KELVINS.find((x) => x > k) ?? KELVINS[0];

function RoomRow({ id, name, light, lit }: { id: RoomId; name: string; light: RoomLight; lit: LitRoom | undefined }) {
  const on = !!lit?.on;
  const kelvin = lit?.kelvin ?? 3000;
  const p = ((light.level - 0.05) / 0.95) * 100;
  const status = on ? `${Math.round(light.level * 100)}% · ${kelvin} K` : light.mode === 'auto' ? 'Auto · on at dusk' : 'Off';
  return (
    <div className={`room ${on ? 'on' : ''}`}>
      <span className="rname">
        {name}
        <small className="tabular">{status}</small>
      </span>
      <input
        className="range dim"
        type="range"
        aria-label={`${name} brightness`}
        min={0.05}
        max={1}
        step={0.05}
        value={light.level}
        style={{ '--p': `${p}%` } as React.CSSProperties}
        onChange={(e) => setRoomLight(id, { level: Number(e.target.value), mode: 'on' })}
      />
      <button
        className="kelvin"
        style={{ background: kelvinCss(kelvin), color: kelvinCss(kelvin) }}
        title={`${kelvin} K: click for ${nextKelvin(kelvin)} K`}
        aria-label={`${name} colour temperature, ${kelvin} kelvin`}
        onClick={() => setRoomLight(id, { kelvin: nextKelvin(kelvin) })}
      />
      <Switch on={on} label={`${name} lights`} onChange={() => toggleRooms([id])} />
    </div>
  );
}

function RoomLights() {
  const unit = useStore((s) => s.unit);
  const scene = useStore((s) => s.lightScene);
  const roomLights = useStore((s) => s.roomLights);
  const lit = useLitRooms();
  const rooms = useMemo(() => lightRooms(unit), [unit]);
  return (
    <div className="block">
      <div className="row between">
        <span className="label">Room lights</span>
        <kbd>L</kbd>
      </div>
      <div className="scenes" role="radiogroup" aria-label="Light scenes">
        {LIGHT_SCENES.map((sc) => (
          <button key={sc.id} role="radio" aria-checked={scene === sc.id} className={scene === sc.id ? 'on' : ''} onClick={() => applyLightScene(sc.id)}>
            <sc.icon className="ic" size={15} />
            {sc.label}
          </button>
        ))}
      </div>
      <div className="rooms">
        {rooms.map((r) => (
          <RoomRow key={r.id} id={r.id} name={r.name} light={roomLight(roomLights, r.id)} lit={lit.get(r.id)} />
        ))}
      </div>
      <p className="readout">
        Auto lights a room once the sun drops below {DUSK_ELEVATION}°. Drag a bar to dim, tap a dot for a warmer or cooler white. Wall switches by the doors work too (<kbd>E</kbd>).
      </p>
    </div>
  );
}

function LightingPanel() {
  const time = useStore((s) => s.time);
  const month = useStore((s) => s.month);
  const set = useStore((s) => s.set);
  const { sunrise, sunset } = useMemo(() => sunTimes(month), [month]);
  const noon = useMemo(() => {
    let best = { el: -90, az: 0, h: 13 };
    for (let h = 11.5; h <= 14.5; h += 0.02) {
      const p = sunPosition(month, h);
      if (p.elevation > best.el) best = { el: p.elevation, az: p.azimuth, h };
    }
    return best;
  }, [month]);
  const sun = sunPosition(month, time);
  const up = sun.elevation > -0.83;
  const p = ((time - T_MIN) / (T_MAX - T_MIN)) * 100;
  const noonNorth = noon.az < 90 || noon.az > 270;
  const presets = [
    { label: 'Sunrise', icon: Sunrise, t: sunrise + 0.3 },
    { label: 'Midday', icon: Sun, t: noon.h },
    { label: 'Golden hour', icon: Sunset, t: sunset - 0.7 },
    { label: 'Night', icon: Moon, t: 20.5 },
  ];

  return (
    <PanelFrame family="lighting" icon={Lightbulb} title="Lighting">
      <div className="block">
        <div className="row between">
          <span className="label">Time of day</span>
          <span className="val">
            {up ? <Sun className="ic" size={18} /> : <Moon className="ic" size={18} />}
            {formatClock(time)}
          </span>
        </div>
        <div className="tod">
          <div className="tod-track" style={{ background: todGradient(sunrise, sunset) }} />
          <input
            type="range"
            aria-label="Time of day"
            min={T_MIN}
            max={T_MAX}
            step={1 / 12}
            value={time}
            onChange={(e) => set({ time: Number(e.target.value) })}
          />
          <div className="tod-thumb" style={{ left: `${p}%` }}>
            {up ? <Sun className="ic" size={15} /> : <Moon className="ic" size={15} />}
          </div>
        </div>
        <div className="row between tiny">
          <span>5 am</span>
          <span className="tabular">
            Sunrise {formatClock(sunrise)} · Sunset {formatClock(sunset)}
          </span>
          <span>12 am</span>
        </div>
        <div className="scenes">
          {presets.map((s) => (
            <button key={s.label} onClick={() => set({ time: Math.round(s.t * 12) / 12 })}>
              <s.icon className="ic" size={15} />
              {s.label}
            </button>
          ))}
        </div>
        <p className="readout">
          {up ? (
            <>
              Sun {Math.round(sun.elevation)}° high in the {compassPoint(sun.azimuth)}
            </>
          ) : (
            <>The sun is below the horizon</>
          )}
        </p>
      </div>

      <div className="block">
        <div className="row between">
          <span className="label">Month</span>
          <span className="val small">{MONTHS[month - 1]}</span>
        </div>
        <div className="months">
          {MONTHS.map((m, i) => (
            <button key={m} className={i + 1 === month ? 'on' : ''} title={m} aria-label={m} onClick={() => set({ month: i + 1 })}>
              {m[0]}
            </button>
          ))}
        </div>
        <p className="readout">
          Midday sun {Math.round(noon.el)}° high, to the {noonNorth ? 'north: it reaches into the balcony' : 'south: the balcony stays shaded'}.
        </p>
      </div>

      <RoomLights />
    </PanelFrame>
  );
}

// ---------------- Views ----------------

export const VIEWS: { id: ViewId; name: string; icon: LucideIcon; img: string; floor: string; note: string; soon?: string }[] = [
  { id: 'mountain', name: 'Mountain', icon: Mountain, img: '/ui/views/mountain.jpg', floor: 'Ground floor', note: 'A highland valley seen from the ground floor.' },
  { id: 'rainforest', name: 'Rainforest', icon: Trees, img: '/ui/views/rainforest.jpg', floor: 'Level 5', note: 'Level 5, about 15 m up: a garden clearing in lowland rainforest, a valley opening to the north-north-east.', soon: 'Soon' },
  { id: 'beach', name: 'Beach', icon: Waves, img: '/ui/views/beach.jpg', floor: 'Level 10', note: 'Level 10, about 30 m up, on the sea front.', soon: 'Soon' },
  { id: 'city', name: 'KL skyline', icon: Building2, img: '/ui/views/city.jpg', floor: 'Level 38', note: 'Level 38, about 115 m up, looking north over Kuala Lumpur to Merdeka 118, the Petronas Towers and the Titiwangsa range. Lights come on at dusk.' },
];

function ViewsPanel() {
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  const current = VIEWS.find((v) => v.id === view);
  return (
    <PanelFrame family="views" icon={Mountain} title="Window view">
      <div className="views">
        {VIEWS.map((v) => (
          <button key={v.id} className={`view ${v.id === view ? 'on' : ''} ${v.soon ? 'locked' : ''}`} disabled={!!v.soon} aria-pressed={v.id === view} onClick={() => set({ view: v.id })}>
            <img src={v.img} alt="" draggable={false} />
            <span className="vname">
              {v.soon ? <Lock className="ic" size={12} /> : v.id === view ? <Check className="ic" size={12} /> : <v.icon className="ic" size={12} />}
              {v.name}
            </span>
            {v.soon ? <span className="soon-tag">{v.soon}</span> : <span className="floor-tag">{v.floor}</span>}
          </button>
        ))}
      </div>
      <p className="note">{current?.note} The landscape is re-lit for the time of day and the sky is simulated for Kuala Lumpur.</p>
    </PanelFrame>
  );
}

// ---------------- Settings ----------------

const QUALITY_NOTES: Record<Quality, string> = {
  low: 'Up to 1280 px wide, no ambient occlusion or bloom. For phones.',
  medium: 'Up to 1920 px, half-resolution ambient occlusion, bloom. Laptop default.',
  high: 'Up to 2880 px, full ambient occlusion, sharper shadows. Needs a strong GPU.',
};

function SettingsPanel() {
  const s = useStore();
  const [copied, setCopied] = useState(false);
  const save = <K extends 'quality' | 'fov' | 'eyeHeight' | 'exposureEv' | 'sensitivity'>(key: K, v: (typeof s)[K]) => {
    s.set({ [key]: v } as Partial<typeof s>);
    writeSetting(key, String(v));
  };
  const diag = {
    gpu: s.stats.gpu,
    render: `${s.stats.width}×${s.stats.height}`,
    dpr: Number(s.stats.dpr.toFixed(2)),
    fps: s.stats.fps,
    quality: s.quality,
    screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}`,
    browser: navigator.userAgent,
  };
  const copy = () => {
    void navigator.clipboard?.writeText(JSON.stringify(diag, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const toEntrance = () => {
    const sp = registry.shell?.spawn;
    if (sp) controls.teleport = { x: sp.position[0], z: sp.position[2], yaw: sp.yaw, pitch: -0.04 };
    s.set({ panel: null });
  };

  return (
    <PanelFrame family="settings" icon={Settings} title="Settings">
      <div className="block">
        <span className="label">Quality</span>
        <Seg<Quality>
          label="Quality"
          value={s.quality}
          onChange={(v) => save('quality', v)}
          options={[
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
          ]}
        />
        <p className="readout">{QUALITY_NOTES[s.quality]}</p>
      </div>
      <div className="block">
        <Range label="Field of view" value={s.fov} min={50} max={80} step={1} format={(v) => `${v}°`} onChange={(v) => save('fov', v)} />
        <Range label="Eye height" value={s.eyeHeight} min={1.45} max={1.85} step={0.01} format={(v) => `${v.toFixed(2)} m · ~${Math.round((v + 0.12) * 100)} cm tall`} onChange={(v) => save('eyeHeight', v)} />
        <Range label="Exposure" value={s.exposureEv} min={-2} max={2} step={0.1} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`} onChange={(v) => save('exposureEv', v)} />
        <Range label="Look sensitivity" value={s.sensitivity} min={0.3} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => save('sensitivity', v)} />
        <div className="row between">
          <span className="label">Show frame rate</span>
          <Switch
            label="Show frame rate"
            on={s.showStats}
            onChange={(v) => {
              s.set({ showStats: v });
              writeSetting('showStats', v ? '1' : '0');
            }}
          />
        </div>
        <button className="ghostbtn" onClick={toEntrance}>
          <House className="ic" size={16} />
          Back to the entrance
        </button>
      </div>
      <div className="block">
        <div className="row between">
          <span className="label">Diagnostics</span>
          <button className="ghostbtn small" onClick={copy}>
            {copied ? <Check className="ic" size={14} /> : <Copy className="ic" size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <dl className="diag tabular">
          <dt>GPU</dt>
          <dd>{diag.gpu || '…'}</dd>
          <dt>Render</dt>
          <dd>
            {diag.render} · DPR {diag.dpr}
          </dd>
          <dt>Frame rate</dt>
          <dd>{diag.fps} fps</dd>
        </dl>
      </div>
    </PanelFrame>
  );
}
