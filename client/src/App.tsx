import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { AdminProvider } from "@/hooks/useAdmin";
import { MAIN_NAV_ITEMS, getMainTabForPath, getPathForMainTab, type MainTab } from "@/lib/appNavigation";
import type { PublicSettingsPayload } from "@shared/settings";

// Lazy-loaded page components for route-level code-splitting
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PrintSalaryPage = lazy(() => import("@/pages/PrintSalaryPage"));
const BarcodeScanPage = lazy(() => import("@/pages/BarcodeScanPage"));
const EmployeesPage = lazy(() => import("@/pages/EmployeesPage"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ClockInPage = lazy(() => import("@/pages/ClockInPage"));
const QRCodePage = lazy(() => import("@/pages/QRCodePage"));

const MAIN_TAB_COMPONENTS: Record<MainTab, LazyExoticComponent<ComponentType>> = {
  attendance: AttendancePage,
  barcode: BarcodeScanPage,
  employees: EmployeesPage,
  history: HistoryPage,
  settings: SettingsPage
};

function MainLayout({
  activeTab,
  children
}: {
  activeTab: MainTab;
  children: ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const resolvedActiveTab = getMainTabForPath(location) ?? activeTab;
  const { data: settings } = useQuery<PublicSettingsPayload>({ queryKey: ['/api/settings'] });
  const barcodeEnabled = settings?.barcodeEnabled !== false;
  const navItems = barcodeEnabled ? MAIN_NAV_ITEMS : MAIN_NAV_ITEMS.filter(item => item.tab !== 'barcode');

  return (
    <div className="min-h-screen p-4 md:p-6 bg-background">
      <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        {/* Header and Navigation */}
        <div className="border-b border-gray-200">
          <div className="p-6 flex justify-between items-center">
            <h1 className="text-2xl font-medium text-gray-800">員工薪資計算系統</h1>
          </div>

          {/* Tab Navigation */}
          <div className="px-6 flex border-b border-gray-200 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.tab}
                type="button"
                className={`px-6 py-3 whitespace-nowrap ${
                  resolvedActiveTab === item.tab
                    ? 'border-b-2 border-primary text-primary font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => {
                  if (resolvedActiveTab !== item.tab) {
                    setLocation(getPathForMainTab(item.tab));
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          <Suspense fallback={<div className="flex justify-center py-12 text-gray-400">載入中…</div>}>
            {children}
          </Suspense>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-gray-500 text-sm">
          員工薪資計算系統 &copy; 2025 版本 1.0.0
        </div>
      </div>
    </div>
  );
}

function MainRoute({ tab }: { tab: MainTab }) {
  const Page = MAIN_TAB_COMPONENTS[tab];

  return (
    <MainLayout activeTab={tab}>
      <Page />
    </MainLayout>
  );
}

function Router() {
  const { data: settings } = useQuery<PublicSettingsPayload>({ queryKey: ['/api/settings'] });
  const barcodeEnabled = settings?.barcodeEnabled !== false;
  const routeItems = barcodeEnabled ? MAIN_NAV_ITEMS : MAIN_NAV_ITEMS.filter(item => item.tab !== 'barcode');

  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen text-gray-400">載入中…</div>}>
      <Switch>
        {routeItems.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            component={() => <MainRoute tab={item.tab} />}
          />
        ))}
        <Route path="/print-salary" component={PrintSalaryPage} />
        <Route path="/clock-in" component={ClockInPage} />
        <Route path="/qrcode" component={QRCodePage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
        <Router />
        <Toaster />
      </AdminProvider>
    </QueryClientProvider>
  );
}

export default App;
