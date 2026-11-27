import { createContext, useContext } from 'react';

// Bridges the DashboardShell's mobile drawer state to the (page-rendered)
// Header so its hamburger can toggle the off-canvas sidebar. Pages never
// import the drawer state themselves — they just call useMobileNav().
interface MobileNavState {
  open: boolean;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavState>({ open: false, toggle: () => {} });

export function MobileNavProvider({ value, children }: { value: MobileNavState; children: React.ReactNode }) {
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export const useMobileNav = () => useContext(MobileNavContext);
