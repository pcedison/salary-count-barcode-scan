import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { calculateOvertime } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface AttendanceTableProps {
  data: Array<{
    id: number;
    employeeId?: number | null;
    date: string;
    clockIn: string;
    clockOut: string;
    isHoliday: boolean;
    isBarcodeScanned?: boolean;
    _employeeName?: string; // 臨時存儲員工名稱
    _employeeDepartment?: string; // 臨時存儲員工部門
  }>;
  isLoading: boolean;
}

export default function AttendanceTable({ data, isLoading }: AttendanceTableProps) {
  const { toast } = useToast();
  const { updateAttendance, deleteAttendance } = useAttendanceData();
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editClockIn, setEditClockIn] = useState<string>('');
  const [editClockOut, setEditClockOut] = useState<string>('');
  
  // Start editing an attendance record
  const handleEdit = (record: any) => {
    setEditingId(record.id);
    setEditDate(record.date);
    setEditClockIn(record.clockIn);
    setEditClockOut(record.clockOut);
  };
  
  // Save edited record
  const handleSaveEdit = async () => {
    if (!editingId) return;
    
    try {
      await updateAttendance(editingId, {
        date: editDate,
        clockIn: editClockIn,
        clockOut: editClockOut
      });
      
      toast({
        title: "已更新",
        description: "考勤記錄已成功更新。",
      });
      
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update record:', error);
      toast({
        title: "更新失敗",
        description: "無法更新考勤記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
  };
  
  // Delete record
  const handleDelete = async (id: number) => {
    if (confirm('確定要刪除此考勤記錄嗎？')) {
      try {
        await deleteAttendance(id);
        
        toast({
          title: "已刪除",
          description: "考勤記錄已成功刪除。",
        });
      } catch (error) {
        console.error('Failed to delete record:', error);
        toast({
          title: "刪除失敗",
          description: "無法刪除考勤記錄，請稍後再試。",
          variant: "destructive"
        });
      }
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">載入資料中...</span>
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">員工</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">部門</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日期</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">上班時間</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">下班時間</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">工作小時</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">加班時數</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                尚無考勤記錄。請使用上方表單新增或使用條碼掃描功能。
              </td>
            </tr>
          ) : (
            data.map((record, index) => {
              const { ot1, ot2, total } = calculateOvertime(record.clockIn, record.clockOut);
              const isEditing = editingId === record.id;
              
              return (
                <tr key={record.id} className={index % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {record._employeeName || '手動輸入'}
                    {record.isBarcodeScanned && <span className="ml-1 px-1 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">條碼</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {record._employeeDepartment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-['Roboto_Mono']">
                    {isEditing ? (
                      <DateTimePicker
                        mode="date"
                        value={editDate}
                        onChange={setEditDate}
                        className="w-full"
                      />
                    ) : (
                      record.date
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-['Roboto_Mono']">
                    {isEditing ? (
                      <DateTimePicker
                        mode="time"
                        value={editClockIn}
                        onChange={setEditClockIn}
                        className="w-full"
                      />
                    ) : (
                      record.clockIn
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-['Roboto_Mono']">
                    {isEditing ? (
                      <DateTimePicker
                        mode="time"
                        value={editClockOut}
                        onChange={setEditClockOut}
                        className="w-full"
                      />
                    ) : (
                      record.clockOut
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center font-['Roboto_Mono']">
                    {8.0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center font-['Roboto_Mono']">
                    {(ot1 + ot2).toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {isEditing ? (
                      <>
                        <Button
                          onClick={handleSaveEdit}
                          className="mr-2 bg-blue-600 hover:bg-blue-700 text-white"
                          size="sm"
                        >
                          <span className="material-icons text-sm">check</span>
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          variant="secondary"
                          size="sm"
                        >
                          <span className="material-icons text-sm">close</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <button 
                          className="text-primary hover:text-blue-700"
                          onClick={() => handleEdit(record)}
                        >
                          <span className="material-icons text-sm">edit</span>
                        </button>
                        <button 
                          className="text-error hover:text-red-700 ml-3"
                          onClick={() => handleDelete(record.id)}
                        >
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
