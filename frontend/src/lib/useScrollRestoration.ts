import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

interface ScrollCoords {
  main: number;
  window: number;
}

const STORAGE_KEY = "matchlog_scroll_positions_v1";

// Memory cache + sessionStorage sync
const scrollMap = new Map<string, ScrollCoords>();

if (typeof window !== "undefined") {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        scrollMap.set(k, v as ScrollCoords);
      }
    }
  } catch {}

  // Let our restoration manager handle scroll positions cleanly
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
}

function persistScrollMap() {
  try {
    const obj: Record<string, ScrollCoords> = {};
    for (const [k, v] of scrollMap.entries()) {
      obj[k] = v;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

export function useScrollRestoration(mainRef: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevKeyRef = useRef<string>(location.key);
  const prevPathRef = useRef<string>(location.pathname + location.search);

  // Save scroll position for current route
  const saveCurrentScroll = () => {
    const coords: ScrollCoords = {
      main: mainRef.current?.scrollTop || 0,
      window: window.scrollY || 0,
    };
    if (prevKeyRef.current) {
      scrollMap.set(prevKeyRef.current, coords);
    }
    if (prevPathRef.current) {
      scrollMap.set(prevPathRef.current, coords);
    }
    persistScrollMap();
  };

  // Listen to scroll events on both main element and window
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (timeout) return;
      timeout = setTimeout(() => {
        timeout = null;
        saveCurrentScroll();
      }, 60);
    };

    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (timeout) clearTimeout(timeout);
      saveCurrentScroll();
      if (mainEl) {
        mainEl.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [location.key, location.pathname, location.search]);

  // Restore scroll on navigation
  useLayoutEffect(() => {
    // Before switching to the new location, record where we were
    saveCurrentScroll();

    prevKeyRef.current = location.key;
    prevPathRef.current = location.pathname + location.search;

    if (navigationType === "POP") {
      const target = scrollMap.get(location.key) || scrollMap.get(location.pathname + location.search);
      if (target) {
        const applyScroll = () => {
          if (mainRef.current && mainRef.current.scrollTop !== target.main) {
            mainRef.current.scrollTop = target.main;
          }
          if (window.scrollY !== target.window) {
            window.scrollTo(0, target.window);
          }
        };

        // Immediate apply
        applyScroll();

        // Sequential re-checks in case dynamic content is rendering
        const frame = requestAnimationFrame(applyScroll);
        const t1 = setTimeout(applyScroll, 40);
        const t2 = setTimeout(applyScroll, 120);
        const t3 = setTimeout(applyScroll, 250);
        const t4 = setTimeout(applyScroll, 500);

        return () => {
          cancelAnimationFrame(frame);
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
          clearTimeout(t4);
        };
      }
    } else if (navigationType === "PUSH") {
      // New navigation: scroll directly to top
      if (mainRef.current) mainRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }, [location.key, location.pathname, location.search, navigationType]);
}
