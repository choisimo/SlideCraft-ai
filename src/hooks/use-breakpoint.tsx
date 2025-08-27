import * as React from "react";

const BREAKPOINTS = {
  xs: 360,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1920,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

export function useBreakpoint() {
  const [currentBreakpoint, setCurrentBreakpoint] = React.useState<Breakpoint>('lg');
  const [windowWidth, setWindowWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      
      let breakpoint: Breakpoint = 'xs';
      for (const [bp, minWidth] of Object.entries(BREAKPOINTS)) {
        if (width >= minWidth) {
          breakpoint = bp as Breakpoint;
        }
      }
      setCurrentBreakpoint(breakpoint);
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  const isAbove = React.useCallback((breakpoint: Breakpoint) => {
    return windowWidth >= BREAKPOINTS[breakpoint];
  }, [windowWidth]);

  const isBelow = React.useCallback((breakpoint: Breakpoint) => {
    return windowWidth < BREAKPOINTS[breakpoint];
  }, [windowWidth]);

  const isBetween = React.useCallback((min: Breakpoint, max: Breakpoint) => {
    return windowWidth >= BREAKPOINTS[min] && windowWidth < BREAKPOINTS[max];
  }, [windowWidth]);

  return {
    current: currentBreakpoint,
    windowWidth,
    isAbove,
    isBelow,
    isBetween,
    isMobile: windowWidth < BREAKPOINTS.md,
    isTablet: windowWidth >= BREAKPOINTS.md && windowWidth < BREAKPOINTS.lg,
    isDesktop: windowWidth >= BREAKPOINTS.lg,
  };
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINTS.md - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < BREAKPOINTS.md);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < BREAKPOINTS.md);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

export function useContainerQuery(containerRef: React.RefObject<HTMLElement>) {
  const [containerWidth, setContainerWidth] = React.useState<number>(0);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);

  return {
    containerWidth,
    isNarrow: containerWidth < 480,
    isMedium: containerWidth >= 480 && containerWidth < 768,
    isWide: containerWidth >= 768,
  };
}