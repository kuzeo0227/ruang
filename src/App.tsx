import { useEffect } from 'react';
import { applyUrlParams, installDebugHook } from './debug';
import { Viewer } from './render/Viewer';
import { Hud } from './ui/Hud';

export function App() {
  useEffect(() => {
    applyUrlParams();
    installDebugHook();
  }, []);
  return (
    <div className="app">
      <Viewer />
      <Hud />
    </div>
  );
}
