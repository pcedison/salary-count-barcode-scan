import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { CheckCircle2, XCircle, UserCheck, Clock, CalendarDays, Lock } from 'lucide-react';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { getTodayDate, getCurrentTime } from '@/lib/utils';
import { eventBus, EventNames } from '@/lib/eventBus';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// 自定義 Hook 用於讀取和更新當天未完成打卡的員工記錄
function useIncompleteAttendanceRecords() {
  // 從 localStorage 讀取未完成的打卡記錄
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 30000 // 每 30 秒刷新一次
  });

  // 篩選出今天的且尚未完成下班打卡的記錄
  const todayDate = getTodayDate();
  const incompleteRecords = (Array.isArray(attendanceRecords) ? attendanceRecords : []).filter((record: any) => {
    return record.date === todayDate && 
           (!record.clockOut || record.clockOut === '') &&
           record.isBarcodeScanned === true;
  });
  
  return incompleteRecords;
}

// 用於儲存和讀取上一次的掃描記錄的函數
const LAST_SCAN_STORAGE_KEY = 'last_barcode_scan';
const RECENT_SCANS_STORAGE_KEY = 'recent_barcode_scans';

function saveLastScan(scanData: any) {
  if (scanData) {
    localStorage.setItem(LAST_SCAN_STORAGE_KEY, JSON.stringify(scanData));
  }
}

function getTodayDateFormatted() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastScan() {
  const storedScan = localStorage.getItem(LAST_SCAN_STORAGE_KEY);
  if (storedScan) {
    try {
      const savedScan = JSON.parse(storedScan);
      
      // 檢查是否是今天的記錄
      if (savedScan && savedScan.timestamp) {
        const today = getTodayDateFormatted();
        const scanDate = new Date(savedScan.timestamp).toISOString().split('T')[0];
        
        // 只有當是今天的記錄時才返回
        if (scanDate === today) {
          return savedScan;
        } else {
          // 不是今天的記錄，清除緩存
          localStorage.removeItem(LAST_SCAN_STORAGE_KEY);
          return null;
        }
      }
      return savedScan;
    } catch (e) {
      console.error('Error parsing stored scan data:', e);
      localStorage.removeItem(LAST_SCAN_STORAGE_KEY);
      return null;
    }
  }
  return null;
}

function saveRecentScans(scans: any[]) {
  if (scans && scans.length > 0) {
    localStorage.setItem(RECENT_SCANS_STORAGE_KEY, JSON.stringify({
      date: getTodayDateFormatted(),
      scans: scans
    }));
  }
}

function getRecentScans() {
  const storedData = localStorage.getItem(RECENT_SCANS_STORAGE_KEY);
  if (storedData) {
    try {
      const data = JSON.parse(storedData);
      
      // 檢查是否包含日期信息並且是今天的記錄
      if (data && data.date && data.scans) {
        const today = getTodayDateFormatted();
        
        // 只有當是今天的記錄時才返回
        if (data.date === today) {
          return data.scans;
        } else {
          // 不是今天的記錄，清除緩存
          localStorage.removeItem(RECENT_SCANS_STORAGE_KEY);
          return [];
        }
      } else if (Array.isArray(data)) {
        // 舊格式兼容（無日期）
        localStorage.removeItem(RECENT_SCANS_STORAGE_KEY);
        return [];
      }
      return [];
    } catch (e) {
      console.error('Error parsing stored scans data:', e);
      localStorage.removeItem(RECENT_SCANS_STORAGE_KEY);
      return [];
    }
  }
  return [];
}

export default function BarcodeScanPage() {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient(); // 獲取 react-query 客戶端實例
  const [idNumber, setIdNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false); // 後台處理中狀態
  const [pendingEmployee, setPendingEmployee] = useState<string>(''); // 正在處理的員工姓名
  const [lastScan, setLastScan] = useState<any>(getLastScan());
  const [recentScans, setRecentScans] = useState<any[]>(getRecentScans());
  const [currentTime, setCurrentTime] = useState<string>(getCurrentTime());
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 獲取未完成打卡的記錄
  const incompleteRecords = useIncompleteAttendanceRecords();
  
  // 當發現有未完成打卡記錄時，更新最近掃描狀態
  useEffect(() => {
    if (incompleteRecords.length > 0 && !lastScan) {
      // 發現尚未下班打卡的記錄，設置為最後一次掃描
      const recordsWithEmployees = incompleteRecords.map((record: any) => {
        // 如果記錄中已有員工資訊，直接使用
        if (record._employeeName) {
          return {
            attendance: record,
            employee: {
              name: record._employeeName,
              department: record._employeeDepartment || '未指定部門'
            },
            employeeName: record._employeeName, // 添加 employeeName 屬性以兼容新的事件格式
            action: 'clock-in',
            success: true
          };
        }
        return null;
      }).filter(Boolean);
      
      if (recordsWithEmployees.length > 0) {
        setLastScan(recordsWithEmployees[0]);
      }
    }
  }, [incompleteRecords, lastScan]);

  // 自動聚焦到輸入框
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [lastScan]);
  
  // 每秒更新時間
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTime());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // 處理打卡成功事件
  const handleBarcodeSuccess = (data: any) => {
    console.log('打卡成功事件:', data);
    
    // 立即清除處理中狀態和輸入欄位
    setIsPending(false);
    setPendingEmployee('');
    setIdNumber('');
    setIsSubmitting(false);
    
    // 立即刷新考勤數據
    queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    
    // 根據打卡類型顯示不同的消息
    const actionType = data.action === 'clock-out' ? '下班打卡' : '上班打卡';
    const employeeName = data.employeeName || data.employee?.name || '員工';
    
    // 顯示打卡成功消息
    toast({
      title: `${actionType}成功`,
      description: `${employeeName} ${actionType}成功`,
      variant: 'default',
    });
    
    // 保存最後一次掃描結果
    setLastScan(data);
    
    // 添加到最近掃描記錄
    const newScans = [data, ...recentScans].slice(0, 10); // 只保留最近10筆
    setRecentScans(newScans);
    saveRecentScans(newScans); // 儲存到 localStorage
    
    // 根據打卡類型設置不同的清除時間
    if (data.action === 'clock-out') {
      // 下班打卡，3秒後清空顯示
      setTimeout(() => {
        setLastScan(null);
        localStorage.removeItem(LAST_SCAN_STORAGE_KEY);
        
        // 再次刷新考勤數據，但保留最近打卡記錄
        queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      }, 3000);
    } else {
      // 上班打卡，設置為較長時間(10秒)
      saveLastScan(data); // 儲存到 localStorage
      
      // 上班打卡也需要清除狀態，但時間較長
      setTimeout(() => {
        setLastScan(null);
        localStorage.removeItem(LAST_SCAN_STORAGE_KEY);
        
        // 再次刷新考勤數據
        queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      }, 10000);
    }
    
    // 確保輸入區域重新聚焦，準備下一次掃描
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  // 處理打卡錯誤事件
  const handleBarcodeError = (data: any) => {
    console.log('打卡錯誤事件:', data);
    
    // 清除處理中狀態
    setIsPending(false);
    setPendingEmployee('');
    
    toast({
      title: "打卡失敗",
      description: data.message || "處理打卡請求時出錯，請稍後再試",
      variant: "destructive"
    });
    
    // 清空表單狀態
    setIsSubmitting(false);
    setIdNumber('');
  };
  
  // 獲取考勤數據，提高獲取頻率
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 2000, // 每 2 秒刷新一次
    staleTime: 1000, // 數據 1 秒後就認為過期，更容易觸發重新獲取
    // 防止反复觸發通知
    refetchOnWindowFocus: false
  });
  
  // 監聽考勤數據變化，自動更新打卡狀態
  useEffect(() => {
    // 如果當前正在處理中狀態或數據為空，不更新，等待處理完成
    if (isPending || !Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
      return;
    }
    
    // 檢查是否有新的打卡記錄
    const todayDate = getTodayDate();
    const today = attendanceRecords.filter((record: any) => record.date === todayDate);
    
    if (today.length > 0) {
      // 找到最新的記錄（假設ID越大越新）
      const latestRecord = today.reduce((latest: any, current: any) => {
        return !latest || current.id > latest.id ? current : latest;
      }, null);
      
      if (latestRecord) {
        // 檢查這個記錄是否有完整的上下班時間
        const hasClockIn = latestRecord.clockIn && latestRecord.clockIn !== '';
        const hasClockOut = latestRecord.clockOut && latestRecord.clockOut !== '';
        
        // 確定正確的打卡動作
        const action = hasClockOut ? 'clock-out' : 'clock-in';
        
        // 創建一致的打卡事件數據
        const lastScanData = {
          employeeName: latestRecord._employeeName,
          employee: {
            name: latestRecord._employeeName,
            department: latestRecord._employeeDepartment || '未指定部門'
          },
          action: action, // 使用判斷的動作
          attendance: latestRecord,
          success: true,
          timestamp: new Date().toISOString()
        };
        
        // 更新最後打卡顯示
        setLastScan(lastScanData);
        
        // 更新打卡記錄列表 - 保證上班/下班狀態的一致性
        const existingRecordIndex = recentScans.findIndex(
          scan => scan.attendance?.id === latestRecord.id
        );
        
        let newScans;
        if (existingRecordIndex >= 0) {
          // 更新現有記錄的打卡狀態
          newScans = [...recentScans];
          newScans[existingRecordIndex] = lastScanData;
        } else {
          // 添加新的打卡記錄
          newScans = [lastScanData, ...recentScans].slice(0, 10);
        }
        
        setRecentScans(newScans);
        saveRecentScans(newScans);
      }
    }
  }, [attendanceRecords, isPending, recentScans, lastScan]);
  
  // 處理條碼掃描表單提交
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!idNumber.trim()) {
      toast({
        title: "掃描錯誤",
        description: "請先掃描員工條碼",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    // 顯示處理中提示
    toast({
      title: "處理中",
      description: "正在處理打卡請求...",
    });
    
    try {
      // 發送打卡請求
      const response = await fetch('/api/barcode-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idNumber: idNumber.trim() })
      });
      
      const data = await response.json();
      
      // 如果是處理中狀態，則顯示等待信息並由WebSocket事件處理最終結果
      if (data.inProgress) {
        console.log('打卡請求已接收，等待後台處理結果...');
        // 設置處理中狀態
        setIsPending(true);
        
        // 如果響應中包含員工信息，顯示正在處理的員工
        if (data.employee?.name) {
          setPendingEmployee(data.employee.name);
        }
        
        // 立即開始檢查結果，並在更短的時間間隔內重複檢查
        let checkAttempts = 0;
        const maxAttempts = 10; // 最多檢查10次，每次間隔0.3秒
        
        // 記錄處理開始時間
        const processStartTime = new Date();
        
        // 記錄目前考勤記錄的最大ID，用於檢測新記錄
        let initialMaxId = 0;
        if (Array.isArray(attendanceRecords) && attendanceRecords.length > 0) {
          initialMaxId = attendanceRecords.reduce((maxId, record) => {
            return Math.max(maxId, record.id || 0);
          }, 0);
        }
        
        // 設置一個變量，用於記錄處理狀態
        // 創建一個標誌，標記已顯示通知
        let hasNotified = false;
        
        const intervalId = setInterval(async () => {
          // 主動獲取最新考勤數據，而不是依賴React Query輪詢
          try {
            const response = await fetch('/api/attendance');
            const latestRecords = await response.json();
            
            // 檢查是否有新記錄
            if (Array.isArray(latestRecords) && latestRecords.length > 0) {
              const newMaxId = latestRecords.reduce((maxId, record) => {
                return Math.max(maxId, record.id || 0);
              }, 0);
              
              // 如果有新記錄，立即結束等待
              if (newMaxId > initialMaxId) {
                clearInterval(intervalId);
                
                // 立即更新 React Query 緩存
                queryClient.setQueryData(['/api/attendance'], latestRecords);
                
                // 清除處理中狀態
                setIsPending(false);
                setPendingEmployee('');
                
                // 只在第一次檢測到新記錄且尚未通知時顯示通知
                if (checkAttempts <= 1 && !hasNotified) {
                  toast({
                    title: "處理完成",
                    description: "打卡處理已完成，請查看考勤記錄",
                  });
                  hasNotified = true;
                }
                
                return;
              }
            }
          } catch (e) {
            console.log('檢查新記錄時出錯', e);
          }
          
          // 安靜地刷新考勤數據，但不會觸發通知
          queryClient.invalidateQueries({ 
            queryKey: ['/api/attendance'],
            // 只更新內部數據，不會導致UI重新渲染
            exact: true
          });
          
          checkAttempts++;
          
          // 如果檢查次數達到最大值，清除處理中狀態
          if (checkAttempts >= maxAttempts) {
            clearInterval(intervalId);
            setIsPending(false);
            setPendingEmployee('');
            
            // 最後再次刷新考勤數據
            queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
            
            // 僅當達到最大嘗試次數時且尚未通知時才顯示通知
            if (checkAttempts === maxAttempts && !hasNotified) {
              toast({
                title: "處理完成",
                description: "打卡處理已完成，請查看考勤記錄",
              });
              hasNotified = true;
            }
          }
        }, 300); // 每0.3秒檢查一次結果，更快地獲取更新
      } else if (data.success) {
        // 立即處理成功情況
        handleBarcodeSuccess({
          ...data,
          action: data.action || 'clock-in',
          employeeName: data.employee?.name,
          timestamp: new Date().toISOString()
        });
      } else {
        // 直接處理錯誤情況
        toast({
          title: "處理失敗",
          description: data.message || "掃描處理失敗，請重試",
          variant: "destructive"
        });
        setIsSubmitting(false);
        setIdNumber('');
      }
    } catch (error: any) {
      console.error('掃描處理錯誤:', error);
      toast({
        title: "處理錯誤",
        description: error.message || "無法處理掃描，請確認網絡連接",
        variant: "destructive"
      });
      setIsSubmitting(false);
      setIdNumber('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">條碼掃描打卡</h1>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">今天是</div>
          <div className="font-bold">{getTodayDate()}</div>
          <div className="text-sm text-muted-foreground mt-1">現在時間</div>
          <div className="font-bold text-xl" id="current-time">{currentTime}</div>
        </div>
      </div>

      {/* 掃描輸入區 */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>員工條碼掃描</CardTitle>
          <CardDescription>請掃描加密後的員工條碼進行打卡（員工管理頁可產生加密條碼）</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBarcodeSubmit} className="space-y-4">
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                id="idNumber"
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="請掃描加密後的條碼..."
                className="flex-1 text-lg h-12 font-mono"
                disabled={isSubmitting}
                autoFocus
                autoComplete="off"
              />
              <Button 
                type="submit" 
                className="min-w-24 h-12"
                disabled={isSubmitting || !idNumber.trim()}
              >
                打卡
              </Button>
            </div>
            
            <div className="mt-4 bg-blue-50 p-3 rounded-md border border-blue-200 text-sm">
              <p className="flex items-center text-blue-800 font-medium mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1 text-blue-600">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                掃描加密條碼說明
              </p>
              <ol className="list-decimal pl-5 text-blue-700 space-y-1">
                <li>為了提高資料安全性，本系統使用加密後的員工ID進行掃描打卡</li>
                <li>請在員工管理頁面使用"產生加密ID"功能來獲取每位員工的加密條碼</li>
                <li>打印或製作加密ID的條碼，以用於員工打卡</li>
                <li>使用加密條碼有助於避免員工身分證號碼直接暴露</li>
              </ol>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 處理中狀態顯示 */}
      {isPending && (
        <Card className="w-full border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center">
              <div className="mr-2 h-6 w-6 animate-spin text-orange-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              處理中...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">後台處理中，請稍等</div>
                <div className="font-medium">
                  系統正在處理{pendingEmployee ? ` ${pendingEmployee} ` : ''}打卡請求...
                </div>
                <div className="relative pt-1">
                  <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-orange-200">
                    <div className="w-full animate-pulse bg-orange-500 h-full"></div>
                  </div>
                  <p className="text-xs text-orange-600 text-right">處理中...</p>
                </div>
              </div>
              <div className="bg-orange-50 p-3 rounded-md border border-orange-200 mt-2">
                <p className="text-orange-800 text-sm flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 8v4"></path>
                    <path d="M12 16h.01"></path>
                  </svg>
                  處理完成後將自動顯示結果，無需重新掃描。請勿重複掃描同一條碼。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最近掃描結果 */}
      {!isPending && lastScan && (
        <Card className={`w-full border-l-4 ${lastScan.action === 'clock-in' ? 'border-l-green-500' : 'border-l-blue-500'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center">
              {lastScan.action === 'clock-in' ? (
                <CheckCircle2 className="mr-2 text-green-500 h-6 w-6" />
              ) : (
                <Clock className="mr-2 text-blue-500 h-6 w-6" />
              )}
              {lastScan.action === 'clock-in' ? '上班打卡成功' : '下班打卡成功'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">員工</div>
                <div className="font-medium flex items-center">
                  <UserCheck className="mr-2 h-4 w-4" />
                  {lastScan.employee?.name || '未知員工'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">部門</div>
                <div className="font-medium">
                  {lastScan.employee?.department || '未指定部門'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">打卡日期</div>
                <div className="font-medium flex items-center">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {lastScan.attendance?.date || getTodayDate()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">打卡時間</div>
                <div className="font-medium">
                  {lastScan.action === 'clock-in' 
                    ? lastScan.attendance?.clockIn 
                    : lastScan.attendance?.clockOut}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 今日打卡記錄 */}
      {recentScans.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>今日打卡記錄</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left">員工</th>
                    <th className="p-2 text-left">部門</th>
                    <th className="p-2 text-left">打卡類型</th>
                    <th className="p-2 text-left">時間</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScans.map((scan, index) => (
                    <tr key={index} className="border-b border-muted hover:bg-muted/20">
                      <td className="p-2">{scan.employee?.name || '未知員工'}</td>
                      <td className="p-2">{scan.employee?.department || '未指定'}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                          scan.action === 'clock-in' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {scan.action === 'clock-in' ? '上班' : '下班'}
                        </span>
                      </td>
                      <td className="p-2 font-mono">
                        {scan.action === 'clock-in' 
                          ? scan.attendance?.clockIn 
                          : scan.attendance?.clockOut}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}