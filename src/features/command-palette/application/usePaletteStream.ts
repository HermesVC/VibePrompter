import { useEffect, useState } from 'react';
import { getSampleResponse } from './quickActions.query';
import type { PaletteState } from '../domain';

export function usePaletteStream(state: PaletteState) {
  const sample = getSampleResponse();
  const [streamed, setStreamed] = useState(state === 'result' ? sample : '');

  useEffect(() => {
    if (state === 'result') {
      setStreamed(sample);
      return;
    }
    if (state !== 'loading') {
      setStreamed('');
      return;
    }
    setStreamed('');
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      setStreamed(sample.slice(0, i));
      if (i >= sample.length) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
  }, [state, sample]);

  return { streamed, total: sample.length };
}
