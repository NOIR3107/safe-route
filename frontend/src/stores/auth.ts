import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser } from "@/api/extensions";

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  /** True after the server rejected the saved session; the login page explains why. */
  expired: boolean;
  setSession: (token: string, user: SessionUser) => void;
  logout: () => void;
  expire: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      expired: false,
      setSession: (token, user) => set({ token, user, expired: false }),
      logout: () => set({ token: null, user: null, expired: false }),
      expire: () => set((s) => (s.token ? { token: null, user: null, expired: true } : s)),
    }),
    {
      name: "saferoute-auth",
      // A session saved by an older version of the app (no scope) would crash the shell: sign in again.
      merge: (persisted, current) => {
        const p = persisted as Partial<AuthState> | undefined;
        return p?.token && p.user?.scope ? { ...current, ...p } : current;
      },
    },
  ),
);
