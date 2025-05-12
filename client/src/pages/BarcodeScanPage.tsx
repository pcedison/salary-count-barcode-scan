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
  // 自動清除計時器引用
  const statusClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 今日打卡記錄自動隱藏計時器
  const recordsVisibilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 狀態顯示的自動清除時間（毫秒）
  const STATUS_AUTO_CLEAR_DELAY = 6000; // 6秒
  // 動畫持續時間（毫秒）
  const ANIMATION_DURATION = 300; // 0.3秒
  // 設置顯示今日打卡記錄的狀態
  const [showTodayRecords, setShowTodayRecords] = useState<boolean>(true);
  
  // 處理上下班打卡自動清除
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
  
  // 監視打卡記錄變化，在條件滿足時隱藏今日打卡記錄
  useEffect(() => {
    // 如果沒有掃描數據或沒有完整的員工信息，不進行處理
    if (!lastScan || !lastScan.employee) return;
    
    // 獲取當前打卡的員工ID
    const currentEmployeeId = lastScan.employee.id;
    const employeeName = lastScan.employee.name;
    
    // 記錄當前掃描數據，便於調試
    console.log('當前掃描數據:', {
      employee: lastScan.employee,
      action: lastScan.action,
      isClockIn: lastScan.isClockIn,
      success: lastScan.success
    });
    
    // 檢查是否是下班打卡
    const isClockOutAction = lastScan.action === 'clock-out' || lastScan.isClockIn === false;
    
    // 如果是下班打卡，則尋找對應的今日記錄
    if (lastScan.success && isClockOutAction) {
      console.log(`${employeeName} 下班打卡成功，檢查完整記錄...`);
      
      // 查找今天該員工的考勤記錄
      const todayDate = getTodayDate();
      console.log(`今日日期: ${todayDate}, 檢查員工ID: ${currentEmployeeId} 的記錄`);
      
      // 確保進行嚴格的日期格式比較
      const todayRecords = todayAttendanceRecords.filter(record => {
        // 將記錄日期標準化為 YYYY/MM/DD 格式
        const recordDate = record.date.replace(/(\d{4})\/(\d{1})\/(\d{1,2})/, '$1/$2/$3')
                                    .replace(/(\d{4})\/(\d{2})\/(\d{1})/, '$1/$2/0$3');
                                    
        console.log(`比較: 記錄日期 "${record.date}" vs 今日 "${todayDate}", 員工ID: ${record.employeeId} vs ${currentEmployeeId}`);
        
        return record.employeeId === currentEmployeeId && recordDate === todayDate;
      });
      console.log(`找到該員工今日記錄 ${todayRecords.length} 筆:`, todayRecords);
      
      // 找到有上下班記錄的考勤數據
      const completedRecords = todayRecords.filter(record => 
        record.clockIn && record.clockOut && record.clockOut !== ''
      );
      console.log(`其中完整記錄 ${completedRecords.length} 筆:`, completedRecords);
      
      if (completedRecords.length > 0) {
        console.log(`${employeeName} 已完成今日上下班打卡，將在 ${STATUS_AUTO_CLEAR_DELAY/1000} 秒後隱藏記錄`);
        
        // 清除之前的計時器（如果有）
        if (recordsVisibilityTimerRef.current) {
          clearTimeout(recordsVisibilityTimerRef.current);
          recordsVisibilityTimerRef.current = null;
        }
        
        // 設置新的計時器，延遲後隱藏記錄
        recordsVisibilityTimerRef.current = setTimeout(() => {
          console.log('執行自動隱藏今日打卡記錄');
          
          // 先使用動畫效果（使用更精確的選擇器）
          const todayCards = document.querySelectorAll('.today-records');
          const incompleteCards = document.querySelectorAll('.incomplete-records');
          const allCards = [...Array.from(todayCards), ...Array.from(incompleteCards)];
          
          if (allCards.length > 0) {
            console.log(`找到 ${allCards.length} 個記錄卡片，開始執行淡出動畫`);
            allCards.forEach(card => {
              (card as HTMLElement).style.opacity = '0';
              (card as HTMLElement).style.transform = 'translateY(10px)';
            });
            
            // 動畫完成後再隱藏
            setTimeout(() => {
              console.log('動畫完成，設置隱藏狀態');
              setShowTodayRecords(false);
              
              // 在隱藏元素後重置樣式，以便下次顯示時可以正常淡入
              setTimeout(() => {
                const resetCards = document.querySelectorAll('.attendance-record-card');
                if (resetCards && resetCards.length > 0) {
                  resetCards.forEach(card => {
                    (card as HTMLElement).style.opacity = '';
                    (card as HTMLElement).style.transform = '';
                  });
                  console.log('已重置所有記錄卡片樣式，為下次顯示做準備');
                }
              }, 500); // 確保元素已完全隱藏
            }, ANIMATION_DURATION);
          } else {
            // 如果沒有找到卡片元素，直接隱藏
            console.log('找不到記錄卡片元素，直接設置隱藏狀態');
            setShowTodayRecords(false);
          }
        }, STATUS_AUTO_CLEAR_DELAY);
      } else {
        console.log(`無法找到 ${employeeName} 的完整上下班記錄，保持顯示`);
        setShowTodayRecords(true);
      }
    } else if (lastScan.success) {
      // 上班打卡時確保顯示記錄
      console.log(`${employeeName} 上班打卡，顯示今日記錄`);
      setShowTodayRecords(true);
    }
    
    // 組件卸載時清除計時器
    return () => {
      if (recordsVisibilityTimerRef.current) {
        clearTimeout(recordsVisibilityTimerRef.current);
        recordsVisibilityTimerRef.current = null;
      }
    };
  }, [lastScan, todayAttendanceRecords]);
  
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
          // 使用選擇性更新而不是全部刷新，減少請求
          queryClient.invalidateQueries({
            queryKey: ['/api/attendance'],
            refetchType: 'active' // 只刷新活躍查詢
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
        
        // 立即更新掃描狀態為處理中，但不顯示具體是上班還是下班
        setLastScan({
          timestamp: new Date().toISOString(),
          success: true,
          action: undefined, // 不設置動作類型，避免錯誤顯示
          isClockIn: undefined, // 不設置打卡類型，避免錯誤顯示
          statusMessage: '正在處理打卡，請稍候...' // 使用中性提示，不預設打卡類型
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
                    lastScan.isClockIn === undefined ? (
                      // 處理中狀態 - 顯示旋轉圖標
                      <div className="animate-spin">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                      </div>
                    ) : (
                      // 成功狀態 - 根據打卡類型顯示對應顏色
                      <CheckCircle2 className={lastScan.isClockIn ? 'text-green-500' : 'text-blue-500'} />
                    )
                  ) : (
                    // 失敗狀態
                    <XCircle className="text-red-500" />
                  )}
                  <h2 className="text-xl font-bold">
                    {lastScan.success ? (
                      lastScan.isClockIn === undefined ? 
                        '處理打卡中...' : 
                        (lastScan.isClockIn ? '上班打卡成功' : '下班打卡成功')
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
          
          {!showTodayRecords && todayAttendanceRecords.length > 0 && (
            <div className="mt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowTodayRecords(true)}
                className="w-full text-sm h-8"
              >
                顯示今日打卡記錄
              </Button>
            </div>
          )}
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
      
      {/* 今日打卡記錄 - 根據條件自動隱藏 */}
      {sortedScanRecords.length > 0 && showTodayRecords && (
        <Card className="w-full animate-in fade-in-0 slide-in-from-bottom-5 duration-300 attendance-record-card today-records"
          style={{transition: `opacity ${ANIMATION_DURATION}ms, transform ${ANIMATION_DURATION}ms`}}>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle>今日打卡記錄</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowTodayRecords(false)}
              className="h-8 px-2"
            >
              隱藏
            </Button>
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
      
      {/* 尚未打下班卡的記錄 - 也根據條件自動隱藏 */}
      {incompleteRecords.length > 0 && showTodayRecords && (
        <Card className="w-full border-orange-200 animate-in fade-in-0 slide-in-from-bottom-5 duration-300 attendance-record-card incomplete-records"
          style={{transition: `opacity ${ANIMATION_DURATION}ms, transform ${ANIMATION_DURATION}ms`}}>
          <CardHeader className="flex flex-row justify-between items-center pb-2">
            <CardTitle className="text-orange-800">尚未打下班卡的員工</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowTodayRecords(false)}
              className="h-8 px-2 border-orange-200 text-orange-800 hover:bg-orange-50"
            >
              隱藏
            </Button>
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