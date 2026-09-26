import { useCallback, useEffect, useState } from "react";

/**
 * Motion preference = the OS setting, overridable by the in-page control.
 *
 * When it resolves to `true` the exhibition keeps its narrative and its
 * lighting but drops the turntable, the parallax, the dust drift and the long
 * camera travels: the same story, told without movement.
 */
export function useMotionPreference() {
  const [systemReduced, setSystemReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const reduced = override ?? systemReduced;
  const toggle = useCallback(() => setOverride((value) => !(value ?? systemReduced)), [systemReduced]);

  return { reduced, toggle };
}
