import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { Loader2, Save, XCircle } from 'lucide-react';

interface EditHistoryRecordModalProps {
  record: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, updatedAttendanceData: any[]) => Promise<void>;
  isSaving: boolean;
}

export default function EditHistoryRecordModal({ 
  record, 
  isOpen, 
  onClose, 
  onSave,
  isSaving
}: EditHistoryRecordModalProps) {
  // 複製一份考勤數據以便編輯
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  
  // 當記錄改變或對話框開啟時，重置編輯狀態
  useEffect(() => {
    if (record && isOpen) {
      setAttendanceData(JSON.parse(JSON.stringify(record.attendanceData || [])));
    }
  }, [record, isOpen]);
  
  // 更新特定考勤記錄的欄位
  const updateAttendanceField = (index: number, field: string, value: any) => {
    const updatedData = [...attendanceData];
    updatedData[index] = { ...updatedData[index], [field]: value };
    setAttendanceData(updatedData);
  };
  
  // 保存修改
  const handleSave = async () => {
    if (!record) return;
    await onSave(record.id, attendanceData);
  };
  
  if (!record) {
    return null;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-gray-900">
            編輯 {record.salaryYear}年{record.salaryMonth}月 考勤記錄
          </DialogTitle>
          <DialogDescription className="sr-only">
            編輯歷史考勤記錄
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4 space-y-4">
          {/* 基本薪資資訊 */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded-md">
            <div>
              <span className="text-sm text-gray-500">基本薪資</span>
              <div className="font-medium">{formatCurrency(record.baseSalary)}</div>
            </div>
            <div>
              <span className="text-sm text-gray-500">加班時數</span>
              <div className="font-medium">{record.totalOT1Hours.toFixed(1)} + {record.totalOT2Hours.toFixed(1)}</div>
            </div>
            <div>
              <span className="text-sm text-gray-500">實發金額</span>
              <div className="font-medium">{formatCurrency(record.netSalary)}</div>
            </div>
          </div>
          
          {/* 考勤記錄表 */}
          <div className="border rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">上班時間</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">下班時間</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">假日</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                      沒有考勤記錄
                    </td>
                  </tr>
                ) : (
                  attendanceData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">
                        <DateTimePicker
                          mode="date"
                          value={item.date}
                          onChange={(value) => updateAttendanceField(index, 'date', value)}
                          className="w-full"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">
                        <DateTimePicker
                          mode="time"
                          value={item.clockIn}
                          onChange={(value) => updateAttendanceField(index, 'clockIn', value)}
                          className="w-full"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">
                        <DateTimePicker
                          mode="time"
                          value={item.clockOut}
                          onChange={(value) => updateAttendanceField(index, 'clockOut', value)}
                          className="w-full"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center">
                          <Switch
                            id={`holiday-switch-${index}`}
                            checked={item.isHoliday}
                            onCheckedChange={(checked) => updateAttendanceField(index, 'isHoliday', checked)}
                          />
                          <Label htmlFor={`holiday-switch-${index}`} className="ml-2 text-xs">
                            {item.isHoliday ? '是' : '否'}
                          </Label>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isSaving}
            >
              <XCircle className="w-4 h-4 mr-1" />
              取消
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  儲存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  儲存變更
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}