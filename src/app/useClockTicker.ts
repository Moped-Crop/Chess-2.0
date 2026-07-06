import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';

/** Запускает отсчёт часов через requestAnimationFrame, пока они идут. */
export function useClockTicker(): void {
  const running = useGameStore(
    (s) => !!s.clock && s.clock.activeColor !== null && s.game.result === 'ongoing',
  );
  const tick = useGameStore((s) => s.tickClock);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, tick]);
}
