import { useEffect, useRef, useState } from 'react';

// Keeps an element mounted while it animates out.
// Returns [mounted, shown]: render while `mounted`, apply the "open" state while `shown`.
export function usePresence(open, duration = 200) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Wait a frame so the closed state paints first. A timer (not rAF) keeps this
      // working while the window is hidden, when the browser pauses animation frames.
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(t);
  }, [open, duration]);
  return [mounted, shown];
}

// Remembers the last non-null value so content stays rendered during an exit animation.
export function useLatest(value) {
  const ref = useRef(value);
  if (value != null) ref.current = value;
  return ref.current;
}
