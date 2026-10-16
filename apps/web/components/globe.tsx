'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
export default function Globe({
  active,
  quality = 'auto',
  onFallback,
}: {
  active: boolean;
  quality?: 'auto' | 'high' | 'low';
  onFallback?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      setFallback(true);
      onFallback?.();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const weak = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const low =
      quality === 'low' ||
      (quality === 'auto' && ((weak ?? 8) <= 4 || navigator.hardwareConcurrency <= 4));
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : quality === 'high' ? 2 : 1.5));
    renderer.setSize(root.clientWidth, 300);
    root.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(38, root.clientWidth / 300, 0.1, 100);
    camera.position.set(0, 0.2, 7);
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffdfa1, 5);
    light.position.set(3, 4, 5);
    scene.add(light);
    const group = new THREE.Group();
    scene.add(group);
    const cage = new THREE.Mesh(
      new THREE.SphereGeometry(1.65, low ? 16 : 24, low ? 12 : 16),
      new THREE.MeshPhysicalMaterial({
        color: 0xb8d3dd,
        transparent: true,
        opacity: 0.12,
        roughness: 0.1,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
    );
    group.add(cage);
    const gold = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.25,
    });
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.67, 0.015, 6, 64), gold);
      ring.rotation.y = (i * Math.PI) / 8;
      group.add(ring);
    }
    const balls: THREE.Mesh[] = [];
    const geometry = new THREE.SphereGeometry(0.22, 16, 12);
    for (let i = 0; i < 22; i++) {
      const phi = i * 2.39996;
      const y = -0.9 + (i % 5) * 0.32;
      const radius = Math.sqrt(Math.max(0, 1.5 - y * y));
      const ball = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: [0xf7f1e3, 0xd4af37, 0xc8283c, 0x14b58a][i % 4] }),
      );
      ball.position.set(Math.cos(phi) * radius * 0.7, y, Math.sin(phi) * radius * 0.7);
      group.add(ball);
      balls.push(ball);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.22, 48), gold);
    base.position.y = -1.9;
    scene.add(base);
    let frame = 0,
      stopped = false;
    let sampleStart = 0,
      samples = 0,
      reductions = 0;
    const render = (time: number) => {
      if (stopped) return;
      if (document.hidden) {
        sampleStart = 0;
        samples = 0;
        frame = requestAnimationFrame(render);
        return;
      }
      if (active && !reduced) {
        group.rotation.y = time * 0.00017;
        balls.forEach((ball, i) => {
          ball.position.y = Math.sin(time * 0.0018 + i) * 0.75;
        });
      }
      renderer.render(scene, camera);
      if (quality === 'auto') {
        sampleStart ||= time;
        samples++;
        if (time - sampleStart > 2000) {
          const fps = (samples * 1000) / (time - sampleStart);
          sampleStart = time;
          samples = 0;
          if (fps < 45 && reductions === 0) {
            renderer.setPixelRatio(0.75);
            renderer.setSize(root.clientWidth, 300);
            reductions++;
          } else if (fps < 30 && reductions > 0) {
            setFallback(true);
            onFallback?.();
            return;
          }
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const resize = new ResizeObserver(() => {
      renderer.setSize(root.clientWidth, 300);
      camera.aspect = root.clientWidth / 300;
      camera.updateProjectionMatrix();
    });
    resize.observe(root);
    const lost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
      onFallback?.();
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, quality, onFallback]);
  return (
    <div ref={host} className="globe-host" aria-hidden="true">
      {fallback && (
        <div className="globe-fallback">
          BINGO<span>O sorteio continua em 2D</span>
        </div>
      )}
    </div>
  );
}
