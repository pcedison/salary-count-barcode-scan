import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useSettings } from '@/hooks/useSettings';
import { useAdmin } from '@/hooks/useAdmin';
import { useEmployees } from '@/hooks/useEmployees';
import SettingsForm from '@/components/SettingsForm';
import SpecialLeaveCounter from '@/components/SpecialLeaveCounter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { constants } from '@/lib/constants';
import { supabaseClient, updateSupabaseConnection } from '@/lib/supabase';
import { Lock, Shield, Loader2, Save, AlertCircle, DollarSign, CalendarDays, Settings } from 'lucide-react';
import AdminLoginDialog from '@/components/AdminLoginDialog';

const DEFAULT_CONFIG = {
  BASE_HOURLY_RATE: constants.BASE_HOURLY_RATE,
  BASE_MONTH_SALARY: constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_DAYS * constants.STANDARD_WORK_HOURS,
  WELFARE_ALLOWANCE: constants.DEFAULT_WELFARE_ALLOWANCE,
  HOUSING_ALLOWANCE: constants.DEFAULT_HOUSING_ALLOWANCE,
  OT1_MULTIPLIER: constants.OT1_MULTIPLIER,
  OT2_MULTIPLIER: constants.OT2_MULTIPLIER,
  
  DEDUCTIONS: [
    { id: 1, name: '勞保費', amount: 658, description: '勞工保險費用' },
    { id: 2, name: '健保費', amount: 443, description: '全民健康保險費用' },
    { id: 3, name: '服務費', amount: 1800, description: '公司服務費' },
    { id: 4, name: '宿舍費', amount: 2500, description: '員工宿舍住宿費' }
  ]
};

interface DeductionItem {
  name: string;
  amount: number;
  description: string;
}

interface AllowanceItem {
  name: string;
  amount: number;
  description: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { settings, isLoading, updateSettings, holidays, isHolidaysLoading, addHoliday, deleteHoliday } = useSettings();
  const { isAdmin, verifyPin, updatePin, logout } = useAdmin();
  const { employees } = useEmployees();
  
  const [baseHourlyRate, setBaseHourlyRate] = useState<number>(DEFAULT_CONFIG.BASE_HOURLY_RATE);
  const [baseMonthSalary, setBaseMonthSalary] = useState<number>(DEFAULT_CONFIG.BASE_MONTH_SALARY);
  const [ot1Multiplier, setOt1Multiplier] = useState<number>(DEFAULT_CONFIG.OT1_MULTIPLIER);
  const [ot2Multiplier, setOt2Multiplier] = useState<number>(DEFAULT_CONFIG.OT2_MULTIPLIER);
  const [deductions, setDeductions] = useState<DeductionItem[]>(DEFAULT_CONFIG.DEDUCTIONS);
  const [allowances, setAllowances] = useState<AllowanceItem[]>([
    { name: '福利金', amount: DEFAULT_CONFIG.WELFARE_ALLOWANCE, description: '員工福利津貼' }
  ]);
  const [newHolidayDate, setNewHolidayDate] = useState<string>('');
  const [newHolidayDescription, setNewHolidayDescription] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [holidayType, setHolidayType] = useState<'worked' | 'sick_leave' | 'personal_leave' | 'national_holiday' | 'typhoon_leave' | 'special_leave'>('national_holiday');
  const [supabaseUrl, setSupabaseUrl] = useState<string>(import.meta.env.VITE_SUPABASE_URL || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing' | 'migrating'>('testing');
  const [isSupabaseActive, setIsSupabaseActive] = useState<boolean>(false);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  
  useEffect(() => {
    if (!isLoading && settings) {
      setBaseHourlyRate(settings.baseHourlyRate || DEFAULT_CONFIG.BASE_HOURLY_RATE);
      setBaseMonthSalary(settings.baseMonthSalary || DEFAULT_CONFIG.BASE_MONTH_SALARY);
      setOt1Multiplier(settings.ot1Multiplier || DEFAULT_CONFIG.OT1_MULTIPLIER);
      setOt2Multiplier(settings.ot2Multiplier || DEFAULT_CONFIG.OT2_MULTIPLIER);
      setDeductions(settings.deductions || DEFAULT_CONFIG.DEDUCTIONS);
      const loadedAllowances = settings.allowances && settings.allowances.length > 0 
        ? settings.allowances 
        : [{ name: '福利金', amount: settings.welfareAllowance || DEFAULT_CONFIG.WELFARE_ALLOWANCE, description: '員工福利津貼' }];
      setAllowances(loadedAllowances);
      
      setHasUnsavedChanges(false);
    }
  }, [isLoading, settings]);
  
  useEffect(() => {
    if (!isLoading && settings) {
      const hasChanges = 
        baseHourlyRate !== settings.baseHourlyRate ||
        baseMonthSalary !== settings.baseMonthSalary ||
        ot1Multiplier !== settings.ot1Multiplier ||
        ot2Multiplier !== settings.ot2Multiplier ||
        JSON.stringify(deductions) !== JSON.stringify(settings.deductions) ||
        JSON.stringify(allowances) !== JSON.stringify(settings.allowances);
      
      setHasUnsavedChanges(hasChanges);
    }
  }, [baseHourlyRate, baseMonthSalary, ot1Multiplier, ot2Multiplier, deductions, allowances, settings, isLoading]);
  
  const testConnection = async () => {
    setConnectionStatus('testing');
    
    try {
      const response = await fetch('/api/supabase-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: supabaseUrl, key: supabaseAnonKey })
      });
      
      if (!response.ok) {
        console.error('Failed to save config to server:', await response.text());
        toast({
          title: "警告",
          description: "無法將連接配置保存到服務器，但仍嘗試連接。",
          variant: "destructive"
        });
      } else {
        console.log('Config saved to server successfully');
      }
      
      localStorage.setItem('supabaseUrl', supabaseUrl);
      localStorage.setItem('supabaseAnonKey', supabaseAnonKey);
      
      const success = updateSupabaseConnection(supabaseUrl, supabaseAnonKey);
      
      if (!success) {
        throw new Error("Supabase client update failed");
      }
      
      const connectionResponse = await fetch('/api/supabase-connection');
      const connectionData = await connectionResponse.json();
      
      if (!connectionData.isConnected) {
        console.warn('Server-side connection test failed, trying client-side test...');
        
        await import('@/lib/supabase').then(async ({ supabaseClient }) => {
          try {
            if (!supabaseClient) {
              throw new Error("Supabase client is not available");
            }
            
            const { data: data1, error: error1 } = await supabaseClient
              .from('settings')
              .select('id')
              .limit(1);
              
            if (error1) {
              console.log('First attempt failed:', error1.message);
              
              if (error1.message && error1.message.includes('Invalid API')) {
                throw new Error('Supabase API密鑰無效。請確保您使用了正確的anon key。');
              }
              
              const { data: data2, error: error2 } = await supabaseClient
                .from('設置')
                .select('id')
                .limit(1);
                
              if (error2) {
                console.log('Second attempt failed:', error2.message);
                
                if (error2.message && error2.message.includes('Invalid API')) {
                  throw new Error('Supabase API密鑰無效。請確保您使用了正確的anon key。');
                }
                
                try {
                  const authResponse = await supabaseClient.auth.getSession();
                  console.log('Auth check result:', authResponse);
                  
                  if (authResponse.error) {
                    throw authResponse.error;
                  }
                } catch (finalError) {
                  console.error('Final connection check failed:', finalError);
                  throw finalError;
                }
              }
            }
            
            setConnectionStatus('connected');
            toast({
              title: "連線成功",
              description: "客戶端 Supabase 連線測試成功，設定已同時保存到本地及服務器，Redeploy 後將自動使用此連線資訊。",
            });
          } catch (connectionError) {
            console.error('Connection test failed in inner try-catch:', connectionError);
            throw connectionError;
          }
        }).catch(error => {
          console.error('Connection test failed:', error);
          setConnectionStatus('disconnected');
          toast({
            title: "連線失敗",
            description: "無法連接到 Supabase，請檢查 URL 和密鑰是否正確。",
            variant: "destructive"
          });
        });
      } else {
        setConnectionStatus('connected');
        setIsSupabaseActive(connectionData.isActive || false);
        toast({
          title: "連線成功",
          description: "服務器端 Supabase 連線測試成功。設定已保存，重啟應用後將自動使用此連線資訊。",
        });
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('disconnected');
      toast({
        title: "連線失敗",
        description: "無法連接到 Supabase，請檢查 URL 和密鑰是否正確。",
        variant: "destructive"
      });
    }
  };
  
  const migrateData = async () => {
    if (connectionStatus !== 'connected') {
      toast({
        title: "無法遷移",
        description: "請先成功測試 Supabase 連接後再嘗試遷移數據。",
        variant: "destructive"
      });
      return;
    }
    
    if (!window.confirm("確定要將所有數據遷移到 Supabase 嗎？這可能需要一些時間，且期間無法使用系統。")) {
      return;
    }
    
    setConnectionStatus('migrating');
    
    try {
      const response = await fetch('/api/supabase-migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "遷移失敗");
      }
      
      toast({
        title: "遷移成功",
        description: "所有數據已成功遷移到 Supabase，系統現在將使用 Supabase 作為默認存儲。",
      });
      
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: "遷移失敗",
        description: error instanceof Error ? error.message : "遷移過程中發生錯誤，請檢查控制台日誌。",
        variant: "destructive"
      });
      
      setConnectionStatus('connected');
    }
  };
  
  const toggleDatabaseConnection = async (enableSupabase: boolean) => {
    try {
      if (!enableSupabase && isSupabaseActive) {
        const adminPin = prompt("請輸入管理員密碼以確認切換到本地 PostgreSQL 數據庫");
        
        if (!adminPin) {
          toast({
            title: "操作已取消",
            description: "沒有提供管理員密碼，數據庫切換已取消。",
            variant: "destructive"
          });
          return;
        }
        
        const confirmMessage = "警告：切換到本地 PostgreSQL 數據庫將停止使用 Supabase 雲端數據。請確認：\n\n" +
                              "1. 您已經備份了所有重要數據\n" +
                              "2. 了解切換後系統將使用本地數據庫\n\n" +
                              "確定要繼續嗎？";
                              
        if (!window.confirm(confirmMessage)) {
          toast({
            title: "操作已取消",
            description: "數據庫切換已取消。",
          });
          return;
        }
        
        const response = await fetch('/api/supabase-toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            enable: enableSupabase,
            adminPin: adminPin
          })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.message || "切換失敗");
        }
        
        setIsSupabaseActive(result.isActive);
        
        toast({
          title: "數據庫切換成功",
          description: "系統現在使用 PostgreSQL 作為數據庫。來自 Supabase 的數據仍然保留在雲端。",
        });
      } else {
        const response = await fetch('/api/supabase-toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable: enableSupabase })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.message || "切換失敗");
        }
        
        setIsSupabaseActive(result.isActive);
        
        toast({
          title: "數據庫切換成功",
          description: "系統現在使用 Supabase 作為數據庫",
        });
      }
    } catch (error) {
      console.error('Database toggle failed:', error);
      toast({
        title: "切換失敗",
        description: error instanceof Error ? error.message : "無法切換數據庫，請檢查連接配置和日誌。",
        variant: "destructive"
      });
    }
  };
  
  const initializeConnection = () => {
    const savedUrl = localStorage.getItem('supabaseUrl') || import.meta.env.VITE_SUPABASE_URL || '';
    const savedKey = localStorage.getItem('supabaseAnonKey') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    setSupabaseUrl(savedUrl);
    setSupabaseAnonKey(savedKey);
    
    fetch('/api/supabase-connection')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsSupabaseActive(data.isActive);
          
          if (data.isConnected) {
            setConnectionStatus('connected');
          } else {
            setConnectionStatus('disconnected');
          }
        }
      })
      .catch(error => {
        console.error('Error checking Supabase connection status:', error);
        setConnectionStatus('disconnected');
      });
    
    if (savedUrl && savedKey && 
        savedUrl !== 'YOUR_SUPABASE_URL' && 
        savedKey !== 'YOUR_SUPABASE_ANON_KEY') {
      updateSupabaseConnection(savedUrl, savedKey);
      fetch('/api/supabase-connection')
        .then(response => response.json())
        .then(data => {
          setConnectionStatus(data.isConnected ? 'connected' : 'disconnected');
          console.log('測試Supabase連線狀態:', data.isConnected ? '已連線' : '未連線');
        })
        .catch(error => {
          console.error('Error testing Supabase connection:', error);
          setConnectionStatus('disconnected');
        });
    } else {
      fetch('/api/supabase-config')
        .then(response => response.json())
        .then(data => {
          if (data && data.url && data.key && 
              data.url !== '' && data.key !== '' && 
              data.url !== 'YOUR_SUPABASE_URL' && 
              data.key !== 'YOUR_SUPABASE_ANON_KEY') {
            
            setSupabaseUrl(data.url);
            setSupabaseAnonKey(data.key);
            setIsSupabaseActive(data.isActive);
            
            localStorage.setItem('supabaseUrl', data.url);
            localStorage.setItem('supabaseAnonKey', data.key);
            
            updateSupabaseConnection(data.url, data.key);
            
            fetch('/api/supabase-connection')
              .then(response => response.json())
              .then(connData => {
                setConnectionStatus(connData.isConnected ? 'connected' : 'disconnected');
                console.log('從配置測試Supabase連線狀態:', connData.isConnected ? '已連線' : '未連線');
              })
              .catch(error => {
                console.error('Error testing Supabase connection:', error);
                setConnectionStatus('disconnected');
              });
          } else {
            setConnectionStatus('disconnected');
          }
        })
        .catch(error => {
          console.error('Error loading Supabase config from server:', error);
          setConnectionStatus('disconnected');
        });
    }
  };
  
  useEffect(() => {
    initializeConnection();
  }, []);
  
  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    
    const totalAllowances = allowances.reduce((sum, item) => sum + item.amount, 0);
    
    setIsSaving(true);
    try {
      await updateSettings({
        baseHourlyRate,
        baseMonthSalary,
        welfareAllowance: totalAllowances,
        ot1Multiplier,
        ot2Multiplier,
        deductions,
        allowances
      });
      
      setHasUnsavedChanges(false);
      
      toast({
        title: "設定已儲存",
        description: "系統設定已成功更新。",
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "儲存失敗",
        description: "設定更新失敗，請稍後再試。",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleAddDeduction = () => {
    setDeductions([
      ...deductions,
      { name: '新項目', amount: 0, description: '' }
    ]);
  };
  
  const handleUpdateDeduction = (index: number, field: string, value: string | number) => {
    const newDeductions = [...deductions];
    newDeductions[index] = {
      ...newDeductions[index],
      [field]: value
    };
    setDeductions(newDeductions);
  };
  
  const handleDeleteDeduction = (index: number) => {
    setDeductions(deductions.filter((_, i) => i !== index));
  };
  
  const handleAddAllowance = () => {
    setAllowances([
      ...allowances,
      { name: '新項目', amount: 0, description: '' }
    ]);
  };
  
  const handleUpdateAllowance = (index: number, field: string, value: string | number) => {
    const newAllowances = [...allowances];
    newAllowances[index] = {
      ...newAllowances[index],
      [field]: value
    };
    setAllowances(newAllowances);
  };
  
  const handleDeleteAllowance = (index: number) => {
    setAllowances(allowances.filter((_, i) => i !== index));
  };
  
  const handleAddHoliday = async () => {
    if (!newHolidayDate) {
      toast({
        title: "日期必填",
        description: "請選擇假日日期。",
        variant: "destructive"
      });
      return;
    }
    
    if (!selectedEmployeeId) {
      toast({
        title: "員工必選",
        description: "請選擇要新增假日的員工。",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const newHoliday = {
        employeeId: selectedEmployeeId,
        date: newHolidayDate,
        name: newHolidayDescription || '假日',
        holidayType: holidayType,
        description: newHolidayDescription || ''
      };
      
      const addedHoliday = await addHoliday(newHoliday);
      
      if (addedHoliday) {
        await handleSaveSettings();
        
        const selectedEmployee = employees?.find(emp => emp.id === selectedEmployeeId);
        toast({
          title: "新增成功",
          description: `已為員工 ${selectedEmployee?.name} 新增假日並自動儲存`,
        });
        setNewHolidayDate('');
        setNewHolidayDescription('');
        setSelectedEmployeeId(null);
        setHolidayType('national_holiday');
      }
    } catch (error) {
      console.error('Failed to add holiday:', error);
      toast({
        title: "新增失敗",
        description: "無法新增假日，請稍後再試。",
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteHoliday = async (id: number) => {
    try {
      const success = await deleteHoliday(id);
      
      if (success) {
        toast({
          title: "刪除成功",
          description: "假日已成功刪除。",
        });
      }
    } catch (error) {
      console.error('Failed to delete holiday:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除假日，請稍後再試。",
        variant: "destructive"
      });
    }
  };
  
  const handleAdminAction = () => {
    if (isAdmin) {
      logout();
      setShowChangePin(false);
      toast({
        title: "登出成功",
        description: "您已登出管理員模式",
      });
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const handleChangePin = async () => {
    if (newPin !== confirmPin) {
      toast({
        title: "PIN碼不匹配",
        description: "新PIN碼與確認PIN碼不匹配，請重新輸入",
        variant: "destructive"
      });
      return;
    }

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      toast({
        title: "PIN碼格式錯誤",
        description: "PIN碼必須為6位數字",
        variant: "destructive"
      });
      return;
    }

    setIsChangingPin(true);
    try {
      const success = await updatePin(currentPin, newPin);
      if (success) {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setShowChangePin(false);
        toast({
          title: "PIN碼更新成功",
          description: "管理員PIN碼已成功更新",
        });
      }
    } finally {
      setIsChangingPin(false);
    }
  };

  const renderAdminSection = () => {
    if (!isAdmin) {
      return (
        <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex flex-col items-center justify-center gap-4">
            <Lock className="w-12 h-12 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-700">管理員功能區</h3>
            <p className="text-gray-500 text-center">您需要管理員權限才能訪問此區域的功能。</p>
            <Button
              onClick={() => setIsLoginModalOpen(true)}
              className="mt-2"
              variant="outline"
            >
              <Shield className="w-4 h-4 mr-2" />
              管理員登入
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-8 p-6 border border-primary/20 rounded-lg bg-primary/5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-primary flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            管理員控制面板
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChangePin(!showChangePin)}
            >
              {showChangePin ? "取消" : "更改PIN碼"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
            >
              登出管理員
            </Button>
          </div>
        </div>

        {showChangePin && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white">
            <h4 className="font-medium mb-4">更改管理員PIN碼</h4>
            <div className="grid gap-4">
              <div>
                <label htmlFor="currentPin" className="block text-sm font-medium mb-1">目前PIN碼</label>
                <Input
                  id="currentPin"
                  type="password"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="請輸入目前的6位數PIN碼"
                  value={currentPin}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    if (value.length <= 6) {
                      setCurrentPin(value);
                    }
                  }}
                />
              </div>
              <div>
                <label htmlFor="newPin" className="block text-sm font-medium mb-1">新PIN碼</label>
                <Input
                  id="newPin"
                  type="password"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="請輸入新的6位數PIN碼"
                  value={newPin}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    if (value.length <= 6) {
                      setNewPin(value);
                    }
                  }}
                />
              </div>
              <div>
                <label htmlFor="confirmPin" className="block text-sm font-medium mb-1">確認PIN碼</label>
                <Input
                  id="confirmPin"
                  type="password"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="請再次輸入新的6位數PIN碼"
                  value={confirmPin}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    if (value.length <= 6) {
                      setConfirmPin(value);
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleChangePin}
                disabled={currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6 || isChangingPin}
                className="mt-2"
              >
                {isChangingPin && <span className="mr-2"><Loader2 className="w-4 h-4 animate-spin" /></span>}
                確認更改
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const commonFormProps = {
    baseHourlyRate,
    baseMonthSalary,
    ot1Multiplier,
    ot2Multiplier,
    deductions,
    allowances,
    holidays: Array.isArray(holidays) ? holidays : [],
    employees: employees || [],
    newHolidayDate,
    newHolidayDescription,
    selectedEmployeeId,
    holidayType,
    supabaseUrl,
    supabaseAnonKey,
    connectionStatus,
    isSupabaseActive,
    isAdmin,
    onBaseHourlyRateChange: setBaseHourlyRate,
    onBaseMonthSalaryChange: setBaseMonthSalary,
    onOt1MultiplierChange: setOt1Multiplier,
    onOt2MultiplierChange: setOt2Multiplier,
    onAddDeduction: handleAddDeduction,
    onUpdateDeduction: handleUpdateDeduction,
    onDeleteDeduction: handleDeleteDeduction,
    onAddAllowance: handleAddAllowance,
    onUpdateAllowance: handleUpdateAllowance,
    onDeleteAllowance: handleDeleteAllowance,
    onNewHolidayDateChange: setNewHolidayDate,
    onNewHolidayDescriptionChange: setNewHolidayDescription,
    onSelectedEmployeeChange: setSelectedEmployeeId,
    onHolidayTypeChange: setHolidayType,
    onAddHoliday: handleAddHoliday,
    onDeleteHoliday: handleDeleteHoliday,
    onSupabaseUrlChange: setSupabaseUrl,
    onSupabaseAnonKeyChange: setSupabaseAnonKey,
    onTestConnection: testConnection,
    onMigrateData: migrateData,
    onToggleDatabase: toggleDatabaseConnection,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">系統設定</h2>
        <div>
          {isAdmin ? (
            <div className="bg-primary/10 px-3 py-1 rounded-full text-primary text-sm font-medium flex items-center">
              <Shield className="w-4 h-4 mr-1" />
              管理員模式
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLoginModalOpen(true)}
              className="text-gray-500"
            >
              <Lock className="w-4 h-4 mr-1" />
              管理員登入
            </Button>
          )}
        </div>
      </div>
      
      {hasUnsavedChanges && isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 relative flex items-start">
          <AlertCircle className="h-4 w-4 text-yellow-600 mt-1 mr-2" />
          <div className="text-sm text-yellow-800">
            您有未儲存的變更。請記得儲存設定以套用變更。
          </div>
        </div>
      )}

      <Tabs defaultValue="salary" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="salary" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            <span>薪資設定</span>
          </TabsTrigger>
          <TabsTrigger value="holiday" className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            <span>假日與特休</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span>系統管理</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salary">
          <SettingsForm {...commonFormProps} section="salary" />
          
          {isAdmin && (
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleSaveSettings}
                disabled={isSaving || !isAdmin || !hasUnsavedChanges}
                className={`${hasUnsavedChanges ? 'bg-success hover:bg-green-600' : 'bg-gray-400'} text-white px-8 py-3 rounded-md font-medium`}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSaving ? "儲存中..." : "儲存薪資設定"}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="holiday">
          <SettingsForm {...commonFormProps} section="holiday" />
          
          <div className="mt-6">
            <SpecialLeaveCounter 
              employees={employees || []}
              isAdmin={isAdmin}
              baseSalary={baseMonthSalary}
            />
          </div>
        </TabsContent>

        <TabsContent value="system">
          <SettingsForm {...commonFormProps} section="system" />
          
          {renderAdminSection()}
        </TabsContent>
      </Tabs>

      <AdminLoginDialog
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          toast({
            title: "管理員驗證成功",
            description: "您已進入管理員模式",
          });
        }}
      />
    </div>
  );
}
