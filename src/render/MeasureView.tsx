// Tape measure: dots at the picked points, a tape between them and a distance label.
// While only the first point is set, the tape follows the crosshair.

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { crosshairHit } from './Player';

const TAPE = '#ffd23f';

export function formatLength(m: number): string {
  return m < 1 ? `${Math.round(m * 1000)} mm` : `${m.toFixed(2)} m`;
}

export function MeasureView() {
  const measuring = useStore((s) => s.measuring);
  const a = useStore((s) => s.measure.a);
  const b = useStore((s) => s.measure.b);
  const tape = useRef<THREE.Mesh>(null);
  const endB = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.Group>(null);
  const text = useRef<HTMLDivElement>(null);
  const mats = useMemo(
    () => ({
      dot: new THREE.MeshBasicMaterial({ color: TAPE, toneMapped: false, depthTest: false, transparent: true }),
      tape: new THREE.MeshBasicMaterial({ color: TAPE, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }),
    }),
    [],
  );
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    if (!measuring || !a) return;
    const pa = new THREE.Vector3(...a);
    const pb = b ? new THREE.Vector3(...b) : crosshairHit();
    const visible = !!pb && pb.distanceTo(pa) > 0.005;
    for (const o of [tape.current, endB.current, label.current]) if (o) o.visible = visible;
    if (!pb || !visible) return;
    const d = pb.clone().sub(pa);
    const len = d.length();
    if (tape.current) {
      tape.current.position.copy(pa).addScaledVector(d, 0.5);
      tape.current.quaternion.setFromUnitVectors(up, d.clone().normalize());
      tape.current.scale.set(1, len, 1);
    }
    endB.current?.position.copy(pb);
    label.current?.position.copy(pa).addScaledVector(d, 0.5);
    if (text.current) text.current.textContent = formatLength(len);
  });

  if (!measuring || !a) return null;
  return (
    <group renderOrder={20}>
      <mesh position={a} material={mats.dot} renderOrder={20}>
        <sphereGeometry args={[0.012, 16, 12]} />
      </mesh>
      <mesh ref={endB} material={mats.dot} renderOrder={20}>
        <sphereGeometry args={[0.012, 16, 12]} />
      </mesh>
      <mesh ref={tape} material={mats.tape} renderOrder={20}>
        <cylinderGeometry args={[0.004, 0.004, 1, 8, 1]} />
      </mesh>
      <group ref={label}>
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="measure-label" ref={text} />
        </Html>
      </group>
    </group>
  );
}
