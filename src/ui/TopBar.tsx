import { ChevronDown, Maximize, Moon, Settings, Sun } from 'lucide-react';
import { STYLES } from '../catalogue/styles';
import { UNITS } from '../plan/units';
import { sunPosition } from '../render/sun';
import { useStore } from '../state/store';
import { STYLE_SHORT, formatClock } from './common';
import { TotalPill } from './EditHud';
import { VIEWS } from './panels';
import { PhotoButton } from './PhotoBar';

export function TopBar() {
  const unit = useStore((s) => s.unit);
  const style = useStore((s) => s.style);
  const time = useStore((s) => s.time);
  const month = useStore((s) => s.month);
  const panel = useStore((s) => s.panel);
  const showStats = useStore((s) => s.showStats);
  const togglePanel = useStore((s) => s.togglePanel);
  const view = useStore((s) => s.view);
  const plan = UNITS[unit];
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;
  const ViewIcon = current.icon;
  const day = sunPosition(month, time).elevation > -1;
  const accent = STYLES[style].palette.find((p) => p.role === 'accent')?.hex ?? '#8b5cf6';

  return (
    <div className="topbar">
      <div className="group">
        <div className="logo glass">
          <span className="mark">R</span>
          <span className="word">Ruang</span>
        </div>
        <button className={`chip glass unit-chip ${panel === 'unit' ? 'open' : ''}`} onClick={() => togglePanel('unit')} aria-label="Unit type">
          <b>{plan.name}</b>
          <span className="chip-sub">{plan.schedule.totalSqft} sq ft</span>
          <ChevronDown className="ic chev" size={15} />
        </button>
        <button className={`chip glass c-style ${panel === 'style' ? 'open' : ''}`} onClick={() => togglePanel('style')} aria-label="Interior style">
          <i className="dot" style={{ background: accent, color: 'var(--c-style)' }} />
          <span className="chip-label">{STYLE_SHORT[style]}</span>
          <ChevronDown className="ic chev" size={15} />
        </button>
        <button className={`chip glass c-views ${panel === 'views' ? 'open' : ''}`} onClick={() => togglePanel('views')} aria-label="Window view">
          <ViewIcon className="ic" size={16} />
          <span className="chip-label">{current.name}</span>
        </button>
      </div>
      <div className="group">
        {showStats && <StatsChip />}
        <TotalPill />
        <button className={`chip glass c-lighting ${panel === 'lighting' ? 'open' : ''}`} onClick={() => togglePanel('lighting')} aria-label="Time of day">
          {day ? <Sun className="ic" size={16} /> : <Moon className="ic" size={16} />}
          <span className="tabular">{formatClock(time)}</span>
        </button>
        <PhotoButton />
        <button className="iconbtn glass big hide-phone" onClick={toggleFullscreen} aria-label="Full screen">
          <Maximize className="ic" size={18} />
        </button>
        <button className={`iconbtn glass big ${panel === 'settings' ? 'open' : ''}`} onClick={() => togglePanel('settings')} aria-label="Settings">
          <Settings className="ic" size={18} />
        </button>
      </div>
    </div>
  );
}

function StatsChip() {
  const stats = useStore((s) => s.stats);
  return (
    <div className="statschip glass tabular" title={stats.gpu}>
      <b className={stats.fps >= 50 ? 'good' : stats.fps >= 30 ? 'ok' : 'bad'}>{stats.fps}</b> fps · {stats.width}×{stats.height}
    </div>
  );
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}
