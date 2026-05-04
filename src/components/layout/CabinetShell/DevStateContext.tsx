import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Dev preview state — used purely for layout/UI testing.
 * Will be removed once все экраны кабинета будут полностью подключены к реальному API.
 */
export type DevState = {
  plan: 'trial' | 'regular' | 'family' | 'business' | 'none';
  trialUsed: boolean;
  subActive: boolean;
  hasReferrals: boolean;
  emailLinked: boolean;
  tgLinked: boolean;
  emailConfirmed: boolean;
  balanceSufficient: boolean;
  supportNotification: boolean;
  gifts: boolean;
  giftStatus: 'available' | 'activated';
};

const defaultDevState: DevState = {
  plan: 'regular',
  trialUsed: false,
  subActive: true,
  hasReferrals: true,
  emailLinked: true,
  tgLinked: true,
  emailConfirmed: true,
  balanceSufficient: true,
  supportNotification: false,
  gifts: false,
  giftStatus: 'available',
};

interface DevStateContextValue {
  devState: DevState;
  setDevState: (s: DevState) => void;
}

const DevStateContext = createContext<DevStateContextValue | null>(null);

export function DevStateProvider({ children }: { children: ReactNode }) {
  const [devState, setDevState] = useState<DevState>(defaultDevState);
  return (
    <DevStateContext.Provider value={{ devState, setDevState }}>
      {children}
    </DevStateContext.Provider>
  );
}

export function useDevState(): DevStateContextValue {
  const ctx = useContext(DevStateContext);
  if (!ctx) {
    // Soft fallback — avoid crashing if a component mounts outside provider
    return { devState: defaultDevState, setDevState: () => {} };
  }
  return ctx;
}
