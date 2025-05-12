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

// 常數定義
const LAST_SCAN_STORAGE_KEY = 'last_barcode_scan';
const RECENT_SCANS_STORAGE_KEY = 'recent_barcode_scans';

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

// 自訂 Hook 用於篩選今天的未完成打卡記錄
function useTodayIncompleteRecords() {
  // 直接從 API 獲取考勤記錄
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 30000, // 每 30 秒刷新一次（降低頻率，減輕伺服器負擔）
    refetchOnWindowFocus: false,
    staleTime: 20000 // 數據 20 秒內不會被視為過期，減少不必要的請求
  });
  
  // 篩選出今天的且尚未完成下班打卡的記錄
  const todayDate = getTodayDate();
  const incompleteRecords = (Array.isArray(attendanceRecords) ? attendanceRecords : []).filter((record: any) => {
    // 只保留今天的記錄
    const isToday = record.date === todayDate;
    // 只保留未完成下班打卡的記錄
    const isIncomplete = (!record.clockOut || record.clockOut === '') && record.isBarcodeScanned === true;
    
    return isToday && isIncomplete;
  });
  
  console.log(`找到 ${incompleteRecords.length} 筆今日未完成打卡記錄，日期: ${todayDate}`);
  return incompleteRecords;
}

// 自訂 Hook 用於篩選並顯示今天的打卡記錄
function useTodayAttendanceRecords() {
  const { data: attendanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    refetchInterval: 30000, // 每 30 秒刷新一次（與另一個查詢保持一致）
    staleTime: 20000, // 數據 20 秒內不會被視為過期
    refetchOnWindowFocus: false // 避免窗口獲得焦點時重新獲取
  });
  
  // 篩選出今天的記錄
  const todayDate = getTodayDate();
  const todayRecords = (Array.isArray(attendanceRecords) ? attendanceRecords : []).filter(record => {
    return record.date === todayDate;
  });
  
  return todayRecords;
}

// 當前頁面元件
export default function BarcodeScanPage() {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();
  
  // 狀態管理
  const [idNumber, setIdNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [pendingEmployee, setPendingEmployee] = useState<string>('');
  const [lastScan, setLastScan] = useState<any>(null); // 始終初始化為 null
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
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [lastScan]);
  
  // 處理掃描條碼
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idNumber.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // 調用 API
      const response = await apiRequest('POST', '/api/barcode-scan', {
        idNumber: idNumber.trim()
      });
      
      // 處理響應
      if (response.ok) {
        console.log('條碼掃描成功，等待處理結果');
        
        // 掃描成功後等待 1 秒，然後查詢最新的考勤記錄和掃描結果
        setTimeout(async () => {
          queryClient.invalidateQueries({
            queryKey: ['/api/attendance']
          });
          
          // 查詢最新的掃描結果
          try {
            const scanResultResponse = await fetch('/api/last-scan-result');
            if (scanResultResponse.ok) {
              const scanResult = await scanResultResponse.json();
              
              // 更新掃描狀態，使用服務器返回的打卡方向（上班或下班）
              setLastScan({
                timestamp: scanResult.timestamp,
                success: true,
                employeeName: scanResult.employeeName,
                employee: {
                  id: scanResult.employeeId,
                  name: scanResult.employeeName,
                  department: '生產部', // 根據實際情況修改或從員工數據中獲取
                  idNumber: ''
                },
                attendance: scanResult.attendance,
                action: scanResult.action,
                isClockIn: scanResult.isClockIn === true || scanResult.action === 'clock-in',
                statusMessage: scanResult.message || `${scanResult.employeeName} ${scanResult.isClockIn ? '上班' : '下班'}打卡成功`
              });
              
              // 顯示成功提示
              toast({
                title: '打卡成功',
                description: scanResult.message,
                variant: 'default'
              });
            }
          } catch (error) {
            console.error('獲取最新掃描結果失敗:', error);
          }
        }, 1000);
        
        // 立即更新掃描狀態為處理中
        setLastScan({
          timestamp: new Date().toISOString(),
          success: true,
          isClockIn: undefined, // 未知是上班還是下班，等待服務器返回
          statusMessage: '成功處理打卡，正在更新考勤記錄...'
        });
      } else {
        const error = await response.text();
        console.error('條碼掃描失敗:', error);
        toast({
          title: '掃描失敗',
          description: error || '無法處理條碼掃描請求',
          variant: 'destructive'
        });
        
        // 更新掃描狀態為失敗
        setLastScan({
          timestamp: new Date().toISOString(),
          success: false,
          statusMessage: error || '無法處理條碼掃描請求'
        });
      }
    } catch (error) {
      console.error('條碼掃描出錯:', error);
      toast({
        title: '掃描出錯',
        description: '處理條碼掃描時出現錯誤',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
      setIdNumber('');
    }
  };
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold mb-6">員工打卡系統</h1>
      
      {/* 打卡狀態顯示區域 */}
      {lastScan && (
        <Card className={`overflow-hidden border-l-4 ${
          lastScan.success 
            ? (lastScan.action === 'clock-in' ? 'border-l-green-500' : 'border-l-blue-500')
            : 'border-l-red-500'
        }`}>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center mb-4 space-x-2">
                  {lastScan.success ? (
                    <CheckCircle2 className={lastScan.isClockIn ? 'text-green-500' : 'text-blue-500'} />
                  ) : (
                    <XCircle className="text-red-500" />
                  )}
                  <h2 className="text-xl font-bold">
                    {lastScan.success ? (
                      lastScan.isClockIn ? '上班打卡成功' : '下班打卡成功'
                    ) : '打卡失敗'}
                  </h2>
                </div>
                
                <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">員工</span>
                    <span className="font-medium">{lastScan.employee?.name || lastScan.employeeName || '未知'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">部門</span>
                    <span className="font-medium">{lastScan.employee?.department || lastScan.department || '生產部'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">打卡日期</span>
                    <span className="font-medium">{lastScan.attendance?.date || getTodayDate()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">打卡狀態</span>
                    <span className={`font-medium ${
                      (lastScan.isClockIn === true || lastScan.action === 'clock-in') 
                        ? 'text-green-600 font-bold' 
                        : (lastScan.isClockIn === false || lastScan.action === 'clock-out') 
                          ? 'text-blue-600 font-bold' 
                          : ''
                    }`}>
                      {lastScan.isClockIn !== undefined 
                        ? (lastScan.isClockIn ? '【上班打卡】' : '【下班打卡】') 
                        : (lastScan.action === 'clock-in' ? '【上班打卡】' : '【下班打卡】')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">打卡時間</span>
                    <span className="font-medium">
                      {lastScan.action === 'clock-in' || lastScan.isClockIn 
                        ? lastScan.attendance?.clockIn || currentTime
                        : lastScan.attendance?.clockOut || currentTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 當有正在處理的打卡請求時顯示進度條 */}
      {isPending && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                <Clock className="w-8 h-8 text-blue-600 animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-center mb-2">正在處理打卡請求</h3>
              <p className="text-center text-muted-foreground mb-4">
                正在處理 {pendingEmployee || '員工'} 的打卡請求，請稍候...
              </p>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-progress"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 掃描條碼輸入區域 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCheck className="mr-2" />
            員工條碼掃描
          </CardTitle>
          <CardDescription>
            掃描或輸入員工證條碼以記錄上下班時間
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex space-x-2">
              <Input
                ref={inputRef}
                type="text"
                placeholder="請掃描員工證條碼"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className="flex-1"
                autoComplete="off"
              />
              <Button 
                type="submit" 
                disabled={isSubmitting || !idNumber.trim()}
              >
                {isSubmitting ? '處理中...' : '確認'}
              </Button>
            </div>
          </form>
          
          <div className="mt-4 flex justify-between items-center">
            <div className="flex items-center space-x-1 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="text-sm">{getTodayDate()}</span>
            </div>
            <div className="flex items-center space-x-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{currentTime}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 管理員區域 */}
      {isAdmin && (
        <Card className="border border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-800 flex items-center">
              <Lock className="mr-2 h-5 w-5" />
              管理員模式
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700 mb-4">
              您已啟用管理員模式，可以手動輸入員工ID進行打卡操作。
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* 今日打卡記錄 */}
      {sortedScanRecords.length > 0 && (
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
                  {sortedScanRecords.map((scan, index) => (
                    <tr key={index} className="border-b border-muted hover:bg-muted/20">
                      <td className="p-2">{scan.employee?.name || scan.employeeName || '未知員工'}</td>
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
      
      {/* 尚未打下班卡的記錄 */}
      {incompleteRecords.length > 0 && (
        <Card className="w-full border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-orange-800">尚未打下班卡的員工</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-orange-50">
                    <th className="p-2 text-left">員工</th>
                    <th className="p-2 text-left">部門</th>
                    <th className="p-2 text-left">上班時間</th>
                    <th className="p-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {incompleteRecords.map((record, index) => (
                    <tr key={index} className="border-b border-orange-100 hover:bg-orange-50/50">
                      <td className="p-2">{record._employeeName || '未知員工'}</td>
                      <td className="p-2">{record._employeeDepartment || '未指定'}</td>
                      <td className="p-2 font-mono">{record.clockIn}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-orange-100 text-orange-800 text-xs">
                          尚未下班
                        </span>
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