import { useEffect, useState } from 'react';

/** Retourne `value` avec un délai : la valeur ne change qu'après `delay` ms sans nouvelle saisie. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
