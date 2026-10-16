'use client';
import { useEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';
function tone() {
  const rate = 22050,
    count = Math.floor(rate * 0.12),
    buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const word = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++)
    view.setInt16(
      44 + i * 2,
      Math.sin((i / rate) * 2 * Math.PI * 660) * Math.sin((Math.PI * i) / count) * 10000,
      true,
    );
  return (
    'data:audio/wav;base64,' +
    btoa(Array.from(new Uint8Array(buffer), (n) => String.fromCharCode(n)).join(''))
  );
}
export function DrawAudio({ number }: { number: number | undefined }) {
  const [enabled, setEnabled] = useState(false),
    [available, setAvailable] = useState(true);
  const sound = useRef<Howl | null>(null),
    previous = useRef(number);
  useEffect(() => {
    const player = new Howl({
      src: [tone()],
      format: ['wav'],
      volume: 0.16,
      onloaderror: () => setAvailable(false),
      onplayerror: () => {
        setEnabled(false);
      },
    });
    sound.current = player;
    return () => {
      player.unload();
      sound.current = null;
    };
  }, []);
  useEffect(() => {
    if (number !== undefined && number !== previous.current) {
      previous.current = number;
      if (enabled) sound.current?.play();
    }
  }, [number, enabled]);
  return (
    <button
      className="secondary"
      aria-pressed={enabled}
      disabled={!available}
      onClick={() => {
        if (!enabled) {
          void Howler.ctx?.resume().catch(() => {});
          sound.current?.play();
        }
        setEnabled((value) => !value);
      }}
    >
      {available ? (enabled ? 'Som ligado' : 'Ativar som') : 'Som indisponível'}
    </button>
  );
}
