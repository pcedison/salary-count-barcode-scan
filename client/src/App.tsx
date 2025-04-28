import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useState } from "react";
import { AdminProvider } from "@/hooks/useAdmin";

// Import pages
import AttendancePage from "@/pages/AttendancePage";
import HistoryPage from "@/pages/HistoryPage";
import SettingsPage from "@/pages/SettingsPage";
import PrintSalaryPage from "@/pages/PrintSalaryPage";
import BarcodeScanPage from "@/pages/BarcodeScanPage";
import EmployeesPage from "@/pages/EmployeesPage";
import NotFound from "@/pages/not-found";

function MainLayout({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<'attendance' | 'history' | 'settings' | 'barcode' | 'employees'>('attendance');
  
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
            <button 
              className={`px-6 py-3 whitespace-nowrap ${activeTab === 'attendance' ? 'border-b-2 border-primary text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('attendance')}
            >
              考勤登記
            </button>
            <button 
              className={`px-6 py-3 whitespace-nowrap ${activeTab === 'barcode' ? 'border-b-2 border-primary text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('barcode')}
            >
              條碼掃描打卡
            </button>
            <button 
              className={`px-6 py-3 whitespace-nowrap ${activeTab === 'employees' ? 'border-b-2 border-primary text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('employees')}
            >
              員工管理
            </button>
            <button 
              className={`px-6 py-3 whitespace-nowrap ${activeTab === 'history' ? 'border-b-2 border-primary text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('history')}
            >
              歷史紀錄
            </button>
            <button 
              className={`px-6 py-3 whitespace-nowrap ${activeTab === 'settings' ? 'border-b-2 border-primary text-primary font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('settings')}
            >
              系統設定
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'attendance' && <AttendancePage />}
          {activeTab === 'barcode' && <BarcodeScanPage />}
          {activeTab === 'employees' && <EmployeesPage />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-gray-500 text-sm">
          員工薪資計算系統 &copy; 2025 版本 1.0.0
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <MainLayout><AttendancePage /></MainLayout>} />
      <Route path="/barcode" component={() => <MainLayout><BarcodeScanPage /></MainLayout>} />
      <Route path="/employees" component={() => <MainLayout><EmployeesPage /></MainLayout>} />
      <Route path="/history" component={() => <MainLayout><HistoryPage /></MainLayout>} />
      <Route path="/settings" component={() => <MainLayout><SettingsPage /></MainLayout>} />
      <Route path="/print-salary" component={PrintSalaryPage} />
      <Route component={NotFound} />
    </Switch>
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
