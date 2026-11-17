import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell, RequirePermission } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/primitives";
import { TooltipProvider } from "@/components/ui/overlay";
import { useLiveConnection } from "@/hooks/queries";
import { useSession, useThemeEffect } from "@/hooks/session";
import { homeFor } from "@/lib/rbac";
import { useUiStore } from "@/stores/ui";
import { LoginPage } from "@/features/auth/LoginPage";
import { PublicPage } from "@/features/public/PublicPage";

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const PlanPage = lazy(() => import("@/features/plan/PlanPage").then((m) => ({ default: m.PlanPage })));
const VersionsPage = lazy(() => import("@/features/plan/VersionsPage").then((m) => ({ default: m.VersionsPage })));
const DrillPage = lazy(() => import("@/features/drill/DrillPage").then((m) => ({ default: m.DrillPage })));
const ZonesPage = lazy(() => import("@/features/resources/ZonesPage").then((m) => ({ default: m.ZonesPage })));
const SheltersPage = lazy(() => import("@/features/resources/SheltersPage").then((m) => ({ default: m.SheltersPage })));
const FleetPage = lazy(() => import("@/features/resources/FleetPage").then((m) => ({ default: m.FleetPage })));
const RoutesPage = lazy(() => import("@/features/resources/RoutesPage").then((m) => ({ default: m.RoutesPage })));
const CheckInPage = lazy(() => import("@/features/checkin/CheckInPage").then((m) => ({ default: m.CheckInPage })));
const FieldPage = lazy(() => import("@/features/field/FieldPage").then((m) => ({ default: m.FieldPage })));
const AuditPage = lazy(() => import("@/features/audit/AuditPage").then((m) => ({ default: m.AuditPage })));
const ArchitecturePage = lazy(() => import("@/features/architecture/ArchitecturePage").then((m) => ({ default: m.ArchitecturePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, refetchOnWindowFocus: false, retry: 1, placeholderData: (prev: unknown) => prev },
  },
});

function PageFallback() {
  return (
    <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function Home() {
  const { user, can } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!can("dashboard:view")) return <Navigate to={homeFor(user.role)} replace />;
  return <DashboardPage />;
}

function Guard({ p, children }: { p: Parameters<typeof RequirePermission>[0]["permission"]; children: ReactNode }) {
  return <RequirePermission permission={p}>{children}</RequirePermission>;
}

function AppRoutes() {
  useLiveConnection();
  useThemeEffect();
  return (
    <ErrorBoundary>
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/public" element={<PublicPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="plan" element={<Guard p="plan:view"><PlanPage /></Guard>} />
          <Route path="plan/versions" element={<Guard p="plan:view"><VersionsPage /></Guard>} />
          <Route path="drill" element={<Guard p="drill:run"><DrillPage /></Guard>} />
          <Route path="zones" element={<ZonesPage />} />
          <Route path="shelters" element={<SheltersPage />} />
          <Route path="fleet" element={<FleetPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="checkin" element={<Guard p="shelter:checkin"><CheckInPage /></Guard>} />
          <Route path="field" element={<Guard p="field:update"><FieldPage /></Guard>} />
          <Route path="audit" element={<Guard p="audit:read"><AuditPage /></Guard>} />
          <Route path="architecture" element={<ArchitecturePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  const theme = useUiStore((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster theme={theme} position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
