import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';
import type { ServerToClient } from '@notelink/shared';

/** 1초마다 다시 그린다 (타이머 표시용) */
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

/** 소켓 이벤트 구독 */
export function useSocket<E extends keyof ServerToClient>(
  ev: E,
  fn: ServerToClient[E],
  deps: unknown[] = [],
) {
  useEffect(() => socket.on(ev, fn), deps); // eslint-disable-line react-hooks/exhaustive-deps
}
