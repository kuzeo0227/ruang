import { Lightbulb, Mountain, Palette, Share2, Sofa, type LucideIcon } from 'lucide-react';
import { useStore, type Panel } from '../state/store';

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  panel?: Exclude<Panel, null>;
  soon?: string;
  key: string;
}

export const TOOLS: Tool[] = [
  { id: 'style', label: 'Style', icon: Palette, panel: 'style', key: '1' },
  { id: 'furniture', label: 'Furniture', icon: Sofa, panel: 'furniture', key: '2' },
  { id: 'lighting', label: 'Lighting', icon: Lightbulb, panel: 'lighting', key: '3' },
  { id: 'views', label: 'Views', icon: Mountain, panel: 'views', key: '4' },
  { id: 'share', label: 'Share', icon: Share2, soon: 'Phase 4', key: '5' },
];

export function Dock() {
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);
  return (
    <nav className="dock glass" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool t-${t.id} ${t.panel && panel === t.panel ? 'active' : ''} ${t.soon ? 'soon' : ''}`}
          onClick={() => t.panel && togglePanel(t.panel)}
          aria-disabled={!!t.soon}
          title={t.soon ? `${t.label} arrives in ${t.soon}` : `${t.label} (${t.key})`}
        >
          <span className="tool-ic">
            <t.icon className="ic" size={22} />
          </span>
          <span className="tool-label">{t.label}</span>
          {t.soon && <span className="soon-badge">{t.soon}</span>}
        </button>
      ))}
    </nav>
  );
}
