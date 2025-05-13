import { useState, useEffect, useRef, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { CheckCircle2, XCircle, UserCheck, Clock, CalendarDays, Loader2 } from 'lucide-react';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { getTodayDate, getCurrentTime } from '@/lib/utils';
import { eventBus, EventNames } from '@/lib/eventBus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { employeeCache, initEmployeeCache, getEmployeeFromCache, updateEmployeeCache } from '@/utils/employeeCache';

// 常數定義
const LAST_SCAN_STORAGE_KEY = 'last_barcode_scan';
const RECENT_SCANS_STORAGE_KEY = 'recent_barcode_scans';

// 掃描結果類型定義
interface ScanResult {
  timestamp: string;
  success: boolean;
  employeeId?: number;
  employeeName?: string;
  employee?: {
    id: number;
    name: string;
    department?: string;
    idNumber?: string;
  };
  department?: string;
  attendance?: any;
  action?: 'clock-in' | 'clock-out';
  isClockIn?: boolean;
  statusMessage: string;
  message?: string;      // 服務器返回的消息
  clockTime?: string;    // 實際打卡時間，用於顯示
}

// 創建一個統一的處理錯誤函數
function createErrorScanResult(message: string): ScanResult {
  return {
    timestamp: new Date().toISOString(),
    success: false,
    employeeId: -1,
    employeeName: '未知',
    action: 'clock-in',
    isClockIn: false,
    statusMessage: message
  };
}

// 創建一個處理中的掃描結果
function createProcessingScanResult(): ScanResult {
  return {
    timestamp: new Date().toISOString(),
    success: true,
    employeeId: -1, 
    employeeName: '處理中',
    action: 'clock-in',
    isClockIn: false,
    statusMessage: '正在處理打卡，請稍候...'
  };
}

// 初始化時清理所有本地儲存，確保不會顯示舊的資料
(function clearAllStoredData() {
  try {
    // 清除所有可能包含考勤記錄的 localStorage 項目
    localStorage.removeItem(LAST_SCAN_STORAGE_KEY);
    localStorage.removeItem(RECENT_SCANS_STORAGE_KEY);
    
    // 找出其他可能包含掃描或考勤資料的項目
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('scan') || key.includes('attendance') || key.includes('barcode'))) {
        localStorage.removeItem(key);
      }
    }
    
    console.log('已清除所有可能包含考勤記錄的本地儲存項目');
  } catch (e) {
    console.error('清理本地儲存時出錯:', e);
  }
})();

// 自訂 Hook 用於獲取和篩選今天的未完成打卡記錄 - 使用常規 API
function useTodayIncompleteRecords() {
  // 獲取員工信息
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    staleTime: 60000 // 員工數據不經常變更，可以較長時間緩存
  });
  
  // 獲取今日日期
  const todayDate = getTodayDate();
  
  // 使用常規考勤記錄 API，但降低請求頻率以減少服務器負載
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 30000, // 從5秒增加到30秒，減少85%的請求數量
    refetchOnWindowFocus: false, // 避免窗口聚焦時額外請求
    staleTime: 25000, // 數據25秒內不會被視為過期，大幅減少請求
    retry: 1 // 減少重試次數
  });
  
  // 使用 useMemo 優化篩選和映射操作
  const incompleteRecords = useMemo(() => {
    // 初始化員工緩存（如果尚未初始化）
    if (employees.length > 0 && employeeCache.size === 0) {
      initEmployeeCache(employees);
    }
    
    return (Array.isArray(attendanceRecords) ? attendanceRecords : [])
      .filter((record: any) => {
        // 只保留今天未完成下班打卡的記錄
        return record.date === todayDate && 
              (!record.clockOut || record.clockOut === '') && 
              record.isBarcodeScanned === true;
      })
      .map(record => {
        // 優先使用緩存獲取員工信息
        const employee = getEmployeeFromCache(record.employeeId) || 
                        employees.find(emp => emp.id === record.employeeId);
        
        return {
          ...record,
          _employeeName: employee?.name || '未知員工',
          _employeeDepartment: employee?.department || '未指定部門'
        };
      });
  }, [attendanceRecords, employees, todayDate]);
  
  console.log(`找到 ${incompleteRecords.length} 筆今日未完成打卡記錄，日期: ${todayDate}`);
  return incompleteRecords;
}

// 自訂 Hook 用於獲取並顯示今天的打卡記錄 - 使用常規 API 增強可靠性
function useTodayAttendanceRecords() {
  // 獲取員工信息
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    staleTime: 60000 // 員工數據不經常變更，可以較長時間緩存
  });
  
  // 獲取今日日期
  const todayDate = getTodayDate();
  
  // 使用常規考勤記錄 API，優化查詢參數以減少請求
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 30000, // 從5秒增加到30秒，顯著減少請求次數
    staleTime: 25000, // 延長緩存有效期，減少請求頻率
    refetchOnWindowFocus: false, // 避免切換窗口時重新請求
    retry: 1  // 減少重試次數，從3減為1
  });
  
  // 使用 useMemo 優化過濾和轉換，減少不必要的計算
  const todayRecords = useMemo(() => {
    // 初始化員工緩存（如果尚未初始化）
    if (employees.length > 0 && employeeCache.size === 0) {
      initEmployeeCache(employees);
    }
    
    return (Array.isArray(attendanceRecords) ? attendanceRecords : [])
      .filter(record => record.date === todayDate)
      .map(record => {
        // 優先從緩存中獲取員工信息，減少查找開銷
        const employee = getEmployeeFromCache(record.employeeId) || 
                        employees.find(emp => emp.id === record.employeeId);
                        
        return {
          ...record,
          _employeeName: employee?.name || '未知員工',
          _employeeDepartment: employee?.department || '未指定部門'
        };
      });
  }, [attendanceRecords, employees, todayDate]);
  
  console.log(`找到 ${todayRecords.length} 筆今日打卡記錄，日期: ${todayDate}`);
  return todayRecords;
}

// 當前頁面元件
export default function BarcodeScanPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // 狀態管理
  const [idNumber, setIdNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [pendingEmployee, setPendingEmployee] = useState<string>('');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null); // 始終初始化為 null
  const [currentTime, setCurrentTime] = useState<string>(getCurrentTime());
  
  // 取得考勤記錄，資料來源只從 API 獲取，不使用 localStorage
  const incompleteRecords = useTodayIncompleteRecords();
  const todayAttendanceRecords = useTodayAttendanceRecords();
  
  // 重新組織為掃描記錄格式
  const scanRecords = todayAttendanceRecords.map(record => {
    // 確保員工資料完整
    const employeeName = record._employeeName || '未知員工';
    const department = record._employeeDepartment || '未指定部門';
    
    // 先創建上班打卡記錄
    const clockInRecord = {
      employee: { name: employeeName, department },
      employeeName,
      action: 'clock-in',
      time: record.clockIn,
      attendance: record,
      success: true,
      timestamp: new Date().toISOString() // 添加時間戳
    };
    
    // 如果有下班打卡，創建下班打卡記錄
    const records = [clockInRecord];
    if (record.clockOut && record.clockOut !== '') {
      records.push({
        employee: { name: employeeName, department },
        employeeName,
        action: 'clock-out',
        time: record.clockOut,
        attendance: record,
        success: true,
        timestamp: new Date().toISOString() // 添加時間戳
      });
    }
    
    return records;
  }).flat(); // 扁平化數組
  
  // 按時間排序，最新的在前面
  const sortedScanRecords = [...scanRecords].sort((a, b) => {
    const timeA = a.action === 'clock-in' ? a.attendance.clockIn : a.attendance.clockOut;
    const timeB = b.action === 'clock-in' ? b.attendance.clockIn : b.attendance.clockOut;
    
    // 最新的在前面
    return timeA > timeB ? -1 : 1;
  });
  
  // 每秒更新時間
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTime());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // 監聽打卡成功事件
  useEffect(() => {
    // 訂閱 eventBus 上的掃描成功事件
    const handleBarcodeSuccess = (data: any) => {
      console.log('打卡成功事件:', data);
      
      // 如果有設置待處理狀態，清除它
      if (isPending) {
        setIsPending(false);
        setPendingEmployee('');
      }
      
      // 更新最後一次掃描結果
      setLastScan(data);
      
      // 根據打卡類型設置不同的清除時間
      const clearTimeout = data.action === 'clock-out' ? 3000 : 10000;
      
      // 設置自動清除計時器
      setTimeout(() => {
        setLastScan(null);
      }, clearTimeout);
      
      // 刷新 API 數據
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    };
    
    // 訂閱打卡開始事件
    const handleBarcodePending = (data: { employeeName: string }) => {
      console.log('打卡處理中:', data);
      setIsPending(true);
      setPendingEmployee(data.employeeName || '');
    };
    
    // 註冊事件監聽
    eventBus.on(EventNames.BARCODE_SUCCESS, handleBarcodeSuccess);
    eventBus.on(EventNames.BARCODE_PENDING, handleBarcodePending);
    
    // 組件卸載時移除事件監聽
    return () => {
      eventBus.off(EventNames.BARCODE_SUCCESS, handleBarcodeSuccess);
      eventBus.off(EventNames.BARCODE_PENDING, handleBarcodePending);
    };
  }, [isPending, queryClient]);
  
  // 自動聚焦輸入框
  const inputRef = useRef<HTMLInputElement>(null);
  // 自動清除計時器引用
  const statusClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 狀態顯示的自動清除時間（毫秒）
  const STATUS_AUTO_CLEAR_DELAY = 6000; // 6秒
  
  // 處理掃描狀態自動清除
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    // 如果有新的掃描結果並且成功，設置自動清除定時器
    if (lastScan && lastScan.success) {
      // 清除之前的計時器（如果有）
      if (statusClearTimerRef.current) {
        clearTimeout(statusClearTimerRef.current);
        statusClearTimerRef.current = null;
      }
      
      // 設置新的計時器，自動清除掃描狀態
      statusClearTimerRef.current = setTimeout(() => {
        console.log('自動清除打卡狀態提示');
        setLastScan(null);
      }, STATUS_AUTO_CLEAR_DELAY);
    }
    
    // 組件卸載時清除計時器
    return () => {
      if (statusClearTimerRef.current) {
        clearTimeout(statusClearTimerRef.current);
        statusClearTimerRef.current = null;
      }
    };
  }, [lastScan]);
  
  // 移除了自動隱藏機制的監視效果
  
  // 簡化的掃描處理函數，參考 V4 版本的設計
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idNumber.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setIdNumber(''); // 立即清空輸入框，避免重複提交
    
    try {
      // 顯示處理中狀態
      setLastScan(createProcessingScanResult());
      
      // 調用 API 進行打卡
      const response = await apiRequest('POST', '/api/barcode-scan', {
        idNumber: idNumber.trim()
      });
      
      // 處理結果
      if (response.ok) {
        // 直接使用 API 返回的結果，無需額外請求
        const scanResult = await response.json();
        console.log('掃描結果:', scanResult);
        
        // 處理進行中狀態的特殊情況
        if (scanResult && scanResult.inProgress === true) {
          console.log('打卡處理中，等待結果...');
          // 保持處理中狀態，不需更新
          // 5秒後刷新資料
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ['/api/attendance'],
              refetchType: 'all'
            });
          }, 5000);
          return;
        }
        
        if (scanResult && scanResult.employeeId && scanResult.employeeName) {
          // 確定打卡類型
          const isClockIn = typeof scanResult.isClockIn === 'boolean'
            ? scanResult.isClockIn
            : (scanResult.action === 'clock-in');
          
          const actionType = isClockIn ? 'clock-in' : 'clock-out';
          const actionText = isClockIn ? '上班' : '下班';
          
          // 更新員工緩存
          if (scanResult.employeeId) {
            updateEmployeeCache({
              id: scanResult.employeeId,
              name: scanResult.employeeName,
              department: scanResult.department || '未指定部門',
              idNumber: scanResult.idNumber || ''
            });
          }
          
          // 輸出調試信息
          console.log(`伺服器返回的打卡信息:`, {
            employeeName: scanResult.employeeName,
            isClockIn: scanResult.isClockIn,
            action: scanResult.action,
            message: scanResult.message,
            interpretedDirection: isClockIn ? '上班' : '下班'
          });
          
          // 確認最終使用的值
          console.log(`使用的打卡方向: ${isClockIn ? '上班' : '下班'}, actionType: ${actionType}`);
          
          // 使用伺服器原始訊息或自行構建訊息
          const statusMessage = scanResult.message || `${scanResult.employeeName} ${actionText}打卡成功`;
          console.log(`最終顯示訊息: ${statusMessage}`);
          
          // 使用服務器提供的時間，或者（如果有的話）使用實際打卡時間
          const clockTime = scanResult.clockTime || 
                         (scanResult.attendance && isClockIn ? 
                           scanResult.attendance.clockIn : scanResult.attendance.clockOut) || 
                         new Date().toLocaleTimeString().slice(0, 5);
          
          console.log(`顯示的打卡時間: ${clockTime}, 來源: ${scanResult.clockTime ? '服務器指定' : '考勤記錄'}`);
          
          // 更新狀態顯示，確保所有顯示與實際打卡類型和時間一致
          setLastScan({
            timestamp: scanResult.timestamp || new Date().toISOString(),
            success: true,
            employeeId: scanResult.employeeId,
            employeeName: scanResult.employeeName,
            employee: {
              id: scanResult.employeeId,
              name: scanResult.employeeName,
              department: scanResult.department || '生產部',
              idNumber: ''
            },
            attendance: scanResult.attendance,
            action: actionType,
            isClockIn: isClockIn,
            statusMessage: statusMessage,
            clockTime: clockTime
          });
          
          // 顯示成功提示
          toast({
            title: `打卡成功`,
            description: statusMessage,
            variant: 'default'
          });
          
          // 刷新考勤資料
          queryClient.invalidateQueries({
            queryKey: ['/api/attendance'],
            refetchType: 'all'
          });
          
          // 6秒後自動清除狀態訊息
          setTimeout(() => {
            setLastScan(null);
          }, 6000);
        } else if (scanResult && scanResult.error) {
          // API返回明確的錯誤信息
          const errorMessage = scanResult.error || '掃描失敗，請重試';
          console.error('API返回錯誤:', errorMessage);
          setLastScan(createErrorScanResult(errorMessage));
          
          toast({
            title: '打卡失敗',
            description: errorMessage,
            variant: 'destructive'
          });
        } else if (scanResult && scanResult.message) {
          // 服務器返回了訊息但尚未包含員工資料
          // 可能是正在處理中或暫時狀態
          console.log('服務器返回訊息但無完整資料:', scanResult.message);
          // 創建一個完整的處理中結果對象
          setLastScan({
            timestamp: scanResult.timestamp || new Date().toISOString(),
            success: true,
            employeeId: -1,
            employeeName: '處理中',
            action: 'clock-in',
            isClockIn: false,
            employee: {
              id: -1,
              name: '處理中',
              department: ''
            },
            statusMessage: scanResult.message || '處理中，請稍候...'
          });
          
          // 5秒後刷新資料
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ['/api/attendance'],
              refetchType: 'all'
            });
          }, 3000);
        } else {
          // 掃描結果缺少必要信息
          console.error('掃描結果數據不完整:', scanResult);
          setLastScan(createErrorScanResult('無法識別員工信息，請重試'));
          
          toast({
            title: '打卡失敗',
            description: '無法識別員工信息，請重試',
            variant: 'destructive'
          });
        }
      } else {
        // API 請求失敗
        try {
          const errorData = await response.json();
          const errorMessage = errorData.error || '掃描失敗，請重試';
          
          console.error('條碼掃描失敗:', errorMessage);
          
          // 更新掃描狀態為失敗
          setLastScan(createErrorScanResult(errorMessage));
          
          toast({
            title: '掃描失敗',
            description: errorMessage,
            variant: 'destructive'
          });
        } catch (e) {
          // 無法解析 JSON 錯誤
          const errorText = await response.text().catch(() => '未知錯誤');
          
          console.error('無法解析錯誤響應:', e);
          setLastScan(createErrorScanResult('掃描處理失敗，請重試'));
          
          toast({
            title: '掃描失敗',
            description: '掃描處理失敗，請重試',
            variant: 'destructive'
          });
        }
      }
    } catch (error) {
      // 網絡錯誤或其他異常
      console.error('條碼掃描請求異常:', error);
      
      setLastScan(createErrorScanResult('網絡錯誤，請檢查連接並重試'));
      
      toast({
        title: '網絡錯誤',
        description: '請檢查連接並重試',
        variant: 'destructive'
      });
    } finally {
      // 清理狀態，恢復輸入
      setIsSubmitting(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">員工打卡</CardTitle>
                <div className="text-right">
                  <p className="text-2xl font-mono">{currentTime}</p>
                  <p className="text-sm text-muted-foreground">{getTodayDate()}</p>
                </div>
              </div>
              <CardDescription>
                請使用條碼掃描槍或輸入員工證號進行打卡
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pb-2 space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="請掃描條碼或輸入證號..."
                      className="text-lg h-12"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="off"
                    />
                  </div>
                  <Button type="submit" disabled={isSubmitting || !idNumber.trim()} className="h-12">
                    {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    打卡
                  </Button>
                </div>
              </form>
              
              {/* 掃描狀態顯示 */}
              {lastScan && (
                <Card className={`overflow-hidden transition-all duration-300 ${lastScan.success ? 'bg-primary/5' : 'bg-destructive/5'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 rounded-full p-2 ${lastScan.success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                        {lastScan.success ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-semibold line-clamp-1">{lastScan.statusMessage}</h3>
                        {lastScan.success && lastScan.employeeName !== '處理中' && (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {lastScan.action === 'clock-in' ? '上班打卡' : '下班打卡'} {lastScan.clockTime || ''}
                            </p>
                            {lastScan.employee?.department && (
                              <p className="text-sm text-muted-foreground">
                                {lastScan.employee.department}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* 未完成打卡的記錄 - 僅顯示今天有上班打卡但尚未下班打卡的記錄 */}
              {incompleteRecords.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">待完成下班打卡 ({incompleteRecords.length})</h3>
                  <div className="space-y-1">
                    {incompleteRecords.map((record) => (
                      <Card key={record.id} className="bg-amber-50 dark:bg-amber-950/20">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserCheck className="w-5 h-5 text-amber-600" />
                              <div>
                                <p className="font-medium">{record._employeeName}</p>
                                <p className="text-xs text-muted-foreground">{record._employeeDepartment}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p>{record.clockIn}</p>
                              <p className="text-xs text-muted-foreground">上班時間</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* 右側欄 - 今日打卡記錄 */}
        <div className="md:w-96">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="w-4 h-4" />
                  今日打卡記錄
                  <span className="text-sm font-normal text-muted-foreground">({todayAttendanceRecords.length})</span>
                </CardTitle>
              </div>
            </CardHeader>
            
            <CardContent className="pb-2">
              {sortedScanRecords.length === 0 ? (
                <div className="text-center p-6">
                  <p className="text-muted-foreground">今日尚無打卡記錄</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[calc(100vh-26rem)] overflow-y-auto pr-1">
                  {sortedScanRecords.map((record, index) => (
                    <Card key={`${record.employee.name}-${record.action}-${index}`} className="bg-muted/30">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {record.action === 'clock-in' ? (
                              <UserCheck className="w-4 h-4 text-green-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-blue-500" />
                            )}
                            <div>
                              <p className="font-medium">{record.employee.name}</p>
                              <p className="text-xs text-muted-foreground">{record.employee.department}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p>{record.time}</p>
                            <p className="text-xs text-muted-foreground">
                              {record.action === 'clock-in' ? '上班時間' : '下班時間'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}