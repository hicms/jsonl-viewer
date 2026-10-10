import { startTransition, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { View } from '../lib/types';
import { ViewSkeleton } from './ViewSkeleton';

export function DeferredView({ children, view }: { children: ReactNode; view: View }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Give the skeleton a paint opportunity before constructing the data view.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        startTransition(() => setReady(true));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const fallback = <ViewSkeleton view={view} />;
  return ready ? <Suspense fallback={fallback}>{children}</Suspense> : fallback;
}
