import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { can, homeFor, type Permission } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

export function useSession() {
  const user = useAuthStore((s) => s.user);
  return {
    user,
    role: user?.role ?? null,
    can: (p: Permission) => can(user?.role, p),
  };
}

/** Logs in (or switches role in demo mode) and lands on the role's home screen. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useCallback(
    async (email: string, password: string, redirect?: string) => {
      const token = await api.login(email, password);
      // Store the token first so /auth/me is authorised.
      setSession(token.access_token, {
        user_id: token.user_id,
        name: token.name,
        email,
        role: token.role,
        scope: { user_id: token.user_id, shelter_id: null, team_id: null, zone_ids: null },
      });
      const me = await api.me();
      setSession(token.access_token, me);
      qc.clear();
      navigate(redirect ?? homeFor(me.role), { replace: true });
      return me;
    },
    [setSession, navigate, qc],
  );
}


export function useThemeEffect(): void {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#131417" : "#f5f5f3");
  }, [theme]);
}

export function useOnline(): boolean {
  const forceOffline = useUiStore((s) => s.forceOffline);
  const online = useNavigatorOnline();
  return online && !forceOffline;
}

function useNavigatorOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
