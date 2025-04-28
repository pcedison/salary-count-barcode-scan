import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useSettings } from '@/hooks/useSettings';
import { useAdmin } from '@/hooks/useAdmin';
import SettingsForm from '@/components/SettingsForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { constants } from '@/lib/constants';
import { supabaseClient, updateSupabaseConnection } from '@/lib/supabase';
import { Lock, Shield, Loader2, Save, AlertCircle } from 'lucide-react';
import AdminLoginDialog from '@/components/AdminLoginDialog';

interface DeductionItem {
  name: string;
  amount: number;
  description: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { settings, isLoading, updateSettings } = useSettings();
  const { isAdmin, verifyPin, updatePin, logout } = useAdmin();
  
  const [baseHourlyRate, setBaseHourlyRate] = useState<number>(constants.DEFAULT_BASE_HOURLY_RATE);
  const [baseMonthSalary, setBaseMonthSalary] = useState<number>(constants.DEFAULT_BASE_MONTH_SALARY);
  const [welfareAllowance, setWelfareAllowance] = useState<number>(constants.DEFAULT_WELFARE_ALLOWANCE);
  const [ot1Multiplier, setOt1Multiplier] = useState<number>(constants.DEFAULT_OT1_MULTIPLIER);
  const [ot2Multiplier, setOt2Multiplier] = useState<number>(constants.DEFAULT_OT2_MULTIPLIER);
  const [deductions, setDeductions] = useState<DeductionItem[]>(constants.DEFAULT_DEDUCTIONS);
  const [holidays, setHolidays] = useState<Array<{ id: number; date: string; description: string }>>([]);
  const [newHolidayDate, setNewHolidayDate] = useState<string>('');
  const [newHolidayDescription, setNewHolidayDescription] = useState<string>('');
  const [supabaseUrl, setSupabaseUrl] = useState<string>(constants.SUPABASE_URL);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(constants.SUPABASE_ANON_KEY);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing' | 'migrating'>('testing');
  const [isSupabaseActive, setIsSupabaseActive] = useState<boolean>(false);
  
  // 設定變更狀態
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Admin related states
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  
  // Load settings when component mounts
  useEffect(() => {
    if (!isLoading && settings) {
      setBaseHourlyRate(settings.baseHourlyRate || constants.DEFAULT_BASE_HOURLY_RATE);
      setBaseMonthSalary(settings.baseMonthSalary || constants.DEFAULT_BASE_MONTH_SALARY);
      setWelfareAllowance(settings.welfareAllowance || constants.DEFAULT_WELFARE_ALLOWANCE);
      setOt1Multiplier(settings.ot1Multiplier || constants.DEFAULT_OT1_MULTIPLIER);
      setOt2Multiplier(settings.ot2Multiplier || constants.DEFAULT_OT2_MULTIPLIER);
      setDeductions(settings.deductions || constants.DEFAULT_DEDUCTIONS);
      
      // 重置變更狀態
      setHasUnsavedChanges(false);
    }
  }, [isLoading, settings]);
  
  // 監視設定變化
  useEffect(() => {
    if (!isLoading && settings) {
      const hasChanges = 
        baseHourlyRate !== settings.baseHourlyRate ||
        baseMonthSalary !== settings.baseMonthSalary ||
        welfareAllowance !== settings.welfareAllowance ||
        ot1Multiplier !== settings.ot1Multiplier ||
        ot2Multiplier !== settings.ot2Multiplier ||
        JSON.stringify(deductions) !== JSON.stringify(settings.deductions);
      
      setHasUnsavedChanges(hasChanges);
    }
  }, [baseHourlyRate, baseMonthSalary, welfareAllowance, ot1Multiplier, ot2Multiplier, deductions, settings, isLoading]);
  
  // 測試 Supabase 連接 - 用戶手動觸發
  const testConnection = async () => {
    setConnectionStatus('testing');
    
    try {
      // 立即保存到服務器（永久存儲）
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
      
      // 同時保存到本地存儲（臨時存儲）
      localStorage.setItem('supabaseUrl', supabaseUrl);
      localStorage.setItem('supabaseAnonKey', supabaseAnonKey);
      
      // 使用當前輸入的連接設置來更新 Supabase 連接
      const success = updateSupabaseConnection(supabaseUrl, supabaseAnonKey);
      
      if (!success) {
        throw new Error("Supabase client update failed");
      }
      
      // 在更新客戶端後嘗試訪問設置表
      import('@/lib/supabase').then(async ({ supabaseClient }) => {
        try {
          if (!supabaseClient) {
            throw new Error("Supabase client is not available");
          }
          
          // 使用更新後的客戶端嘗試訪問settings表
          // 因為我們剛剛遷移到Supabase，表名可能遵循PostgreSQL的命名規則
          const { data: data1, error: error1 } = await supabaseClient
            .from('settings')
            .select('id')
            .limit(1);
            
          if (error1) {
            console.log('First attempt failed:', error1.message);
            
            // 檢查是否是API密鑰無效的錯誤
            if (error1.message && error1.message.includes('Invalid API')) {
              throw new Error('Supabase API密鑰無效。請確保您使用了正確的anon key。');
            }
            
            // 如果第一次查詢失敗，嘗試使用表名的變體（設置）
            const { data: data2, error: error2 } = await supabaseClient
              .from('設置')
              .select('id')
              .limit(1);
              
            if (error2) {
              console.log('Second attempt failed:', error2.message);
              
              // 檢查是否是API密鑰無效的錯誤
              if (error2.message && error2.message.includes('Invalid API')) {
                throw new Error('Supabase API密鑰無效。請確保您使用了正確的anon key。');
              }
              
              // 如果兩種表名都失敗，則嘗試獲取所有可用的表或進行其他檢查
              try {
                // 最後嘗試直接進行授權驗證測試
                const authResponse = await supabaseClient.auth.getSession();
                console.log('Auth check result:', authResponse);
                
                if (authResponse.error) {
                  throw authResponse.error;
                }
                // 如果能成功獲取會話，也視為連接成功
              } catch (finalError) {
                console.error('Final connection check failed:', finalError);
                throw finalError;
              }
            }
          }
          
          // 連接成功，更新狀態並顯示成功消息
          setConnectionStatus('connected');
          toast({
            title: "連線成功",
            description: "Supabase 連線測試成功，設定已同時保存到本地及服務器，Redeploy 後將自動使用此連線資訊。",
          });
        } catch (connectionError) {
          console.error('Connection test failed in inner try-catch:', connectionError);
          throw connectionError; // 向外層拋出錯誤
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
  
  // 遷移數據到 Supabase - 用戶手動觸發
  const migrateData = async () => {
    if (connectionStatus !== 'connected') {
      toast({
        title: "無法遷移",
        description: "請先成功測試 Supabase 連接後再嘗試遷移數據。",
        variant: "destructive"
      });
      return;
    }
    
    // 確認對話框
    if (!window.confirm("確定要將所有數據遷移到 Supabase 嗎？這可能需要一些時間，且期間無法使用系統。")) {
      return;
    }
    
    setConnectionStatus('migrating');
    
    try {
      // 調用遷移 API
      const response = await fetch('/api/supabase-migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || "遷移失敗");
      }
      
      // 遷移成功，通知用戶
      toast({
        title: "遷移成功",
        description: "所有數據已成功遷移到 Supabase，系統現在將使用 Supabase 作為默認存儲。",
      });
      
      // 更新連接狀態
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: "遷移失敗",
        description: error instanceof Error ? error.message : "遷移過程中發生錯誤，請檢查控制台日誌。",
        variant: "destructive"
      });
      
      // 重置連接狀態
      setConnectionStatus('connected');
    }
  };
  
  // 切換數據庫連接方式（PostgreSQL 或 Supabase）
  const toggleDatabaseConnection = async (enableSupabase: boolean) => {
    try {
      // 如果從 Supabase 切換回 PostgreSQL，需要管理員驗證
      if (!enableSupabase && isSupabaseActive) {
        // 提示輸入管理員密碼
        const adminPin = prompt("請輸入管理員密碼以確認切換到本地 PostgreSQL 數據庫");
        
        // 如果用戶取消或密碼為空，則中止操作
        if (!adminPin) {
          toast({
            title: "操作已取消",
            description: "沒有提供管理員密碼，數據庫切換已取消。",
            variant: "destructive"
          });
          return;
        }
        
        // 顯示確認對話框，提醒用戶切換可能的影響
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
        
        // 發送切換請求，包含管理員密碼
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
        
        // 更新當前狀態
        setIsSupabaseActive(result.isActive);
        
        toast({
          title: "數據庫切換成功",
          description: "系統現在使用 PostgreSQL 作為數據庫。來自 Supabase 的數據仍然保留在雲端。",
        });
      } else {
        // 切換到 Supabase 的原有流程
        const response = await fetch('/api/supabase-toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable: enableSupabase })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.message || "切換失敗");
        }
        
        // 更新當前狀態
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
  
  // 載入 Supabase 配置並從本地儲存初始化
  const initializeConnection = () => {
    // 僅在初始渲染時嘗試連接，不進行實際的連接測試
    
    // 從本地存儲和環境常量加載
    const savedUrl = localStorage.getItem('supabaseUrl') || constants.SUPABASE_URL || '';
    const savedKey = localStorage.getItem('supabaseAnonKey') || constants.SUPABASE_ANON_KEY || '';
    
    // 設置到 state
    setSupabaseUrl(savedUrl);
    setSupabaseAnonKey(savedKey);
    
    // 檢查當前使用的數據庫類型
    fetch('/api/supabase-connection')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setIsSupabaseActive(data.isActive);
          
          // 如果配置有效且已連接，更新連接狀態
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
    
    // 如果本地有值，初始化 Supabase 客戶端（同時進行真實連接測試）
    if (savedUrl && savedKey && 
        savedUrl !== 'YOUR_SUPABASE_URL' && 
        savedKey !== 'YOUR_SUPABASE_ANON_KEY') {
      updateSupabaseConnection(savedUrl, savedKey);
      // 測試連接，確保狀態顯示正確
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
      // 否則嘗試從服務器獲取配置
      fetch('/api/supabase-config')
        .then(response => response.json())
        .then(data => {
          if (data && data.url && data.key && 
              data.url !== '' && data.key !== '' && 
              data.url !== 'YOUR_SUPABASE_URL' && 
              data.key !== 'YOUR_SUPABASE_ANON_KEY') {
            
            // 更新 state
            setSupabaseUrl(data.url);
            setSupabaseAnonKey(data.key);
            setIsSupabaseActive(data.isActive);
            
            // 同步更新本地存儲
            localStorage.setItem('supabaseUrl', data.url);
            localStorage.setItem('supabaseAnonKey', data.key);
            
            // 初始化 Supabase 客戶端（同時進行真實連接測試）
            updateSupabaseConnection(data.url, data.key);
            
            // 測試連接，確保狀態顯示正確
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
            // 如果都沒有有效配置，顯示未連接狀態
            setConnectionStatus('disconnected');
          }
        })
        .catch(error => {
          console.error('Error loading Supabase config from server:', error);
          setConnectionStatus('disconnected');
        });
    }
  };
  
  // 僅在組件掛載時初始化連接，不進行定期監視
  useEffect(() => {
    // 掛載時初始化連接
    initializeConnection();
    
    // 不再設置計時器，避免產生大量 API 請求
  }, []); // 空依賴數組，只在組件掛載時執行一次
  
  // Save settings
  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    
    setIsSaving(true);
    try {
      await updateSettings({
        baseHourlyRate,
        baseMonthSalary,
        welfareAllowance,
        ot1Multiplier,
        ot2Multiplier,
        deductions
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
  
  // Add a new deduction
  const handleAddDeduction = () => {
    setDeductions([
      ...deductions,
      { name: '新項目', amount: 0, description: '' }
    ]);
  };
  
  // Update a deduction
  const handleUpdateDeduction = (index: number, field: string, value: string | number) => {
    const newDeductions = [...deductions];
    newDeductions[index] = {
      ...newDeductions[index],
      [field]: value
    };
    setDeductions(newDeductions);
  };
  
  // Delete a deduction
  const handleDeleteDeduction = (index: number) => {
    setDeductions(deductions.filter((_, i) => i !== index));
  };
  
  // Add a holiday
  const handleAddHoliday = async () => {
    if (!newHolidayDate) {
      toast({
        title: "日期必填",
        description: "請選擇假日日期。",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Implementation would use holidaysTable.add from supabase.ts
      const newHoliday = {
        date: newHolidayDate,
        description: newHolidayDescription || ''
      };
      
      // In a real implementation, this would add to the database
      // For now, just add to local state
      setHolidays([...holidays, { id: Date.now(), ...newHoliday }]);
      
      setNewHolidayDate('');
      setNewHolidayDescription('');
      
      toast({
        title: "新增成功",
        description: "假日已成功新增。",
      });
    } catch (error) {
      console.error('Failed to add holiday:', error);
      toast({
        title: "新增失敗",
        description: "無法新增假日，請稍後再試。",
        variant: "destructive"
      });
    }
  };
  
  // Delete a holiday
  const handleDeleteHoliday = async (id: number) => {
    try {
      // Implementation would use holidaysTable.delete from supabase.ts
      
      // For now, just remove from local state
      setHolidays(holidays.filter(holiday => holiday.id !== id));
      
      toast({
        title: "刪除成功",
        description: "假日已成功刪除。",
      });
    } catch (error) {
      console.error('Failed to delete holiday:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除假日，請稍後再試。",
        variant: "destructive"
      });
    }
  };
  
  // Handle admin login/logout
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

  // Handle change PIN
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

  // Render admin section
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

  return (
    <div className="space-y-8">
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
      
      {/* 未儲存變更警告 */}
      {hasUnsavedChanges && isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 relative flex items-start">
          <AlertCircle className="h-4 w-4 text-yellow-600 mt-1 mr-2" />
          <div className="text-sm text-yellow-800">
            您有未儲存的變更。請記得儲存設定以套用變更。
          </div>
        </div>
      )}
      
      {/* 設定表單 */}
      <SettingsForm
        baseHourlyRate={baseHourlyRate}
        baseMonthSalary={baseMonthSalary}
        welfareAllowance={welfareAllowance}
        ot1Multiplier={ot1Multiplier}
        ot2Multiplier={ot2Multiplier}
        deductions={deductions}
        holidays={holidays}
        newHolidayDate={newHolidayDate}
        newHolidayDescription={newHolidayDescription}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        connectionStatus={connectionStatus}
        isSupabaseActive={isSupabaseActive}
        isAdmin={isAdmin}
        onBaseHourlyRateChange={setBaseHourlyRate}
        onBaseMonthSalaryChange={setBaseMonthSalary}
        onWelfareAllowanceChange={setWelfareAllowance}
        onOt1MultiplierChange={setOt1Multiplier}
        onOt2MultiplierChange={setOt2Multiplier}
        onAddDeduction={handleAddDeduction}
        onUpdateDeduction={handleUpdateDeduction}
        onDeleteDeduction={handleDeleteDeduction}
        onNewHolidayDateChange={setNewHolidayDate}
        onNewHolidayDescriptionChange={setNewHolidayDescription}
        onAddHoliday={handleAddHoliday}
        onDeleteHoliday={handleDeleteHoliday}
        onSupabaseUrlChange={setSupabaseUrl}
        onSupabaseAnonKeyChange={setSupabaseAnonKey}
        onTestConnection={testConnection}
        onMigrateData={migrateData}
        onToggleDatabase={toggleDatabaseConnection}
      />
      
      {/* 基本設定和扣款設定後的儲存按鈕 */}
      {isAdmin && hasUnsavedChanges && (
        <div className="mt-4 flex justify-end">
          <Button 
            onClick={handleSaveSettings}
            disabled={isSaving || !isAdmin}
            className="bg-primary/90 hover:bg-primary text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                儲存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                儲存以上設定
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Admin Section */}
      {renderAdminSection()}
      
      {/* 底部儲存按鈕 */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSaveSettings}
          disabled={isSaving || !isAdmin}
          className={`${isAdmin ? 'bg-success hover:bg-green-600' : 'bg-gray-400 cursor-not-allowed'} text-white px-8 py-3 rounded-md font-medium`}
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : !isAdmin ? (
            <Lock className="mr-2 h-4 w-4" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isSaving ? "儲存中..." : "儲存所有設定"}
        </Button>
      </div>

      {/* Admin Login Dialog */}
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
