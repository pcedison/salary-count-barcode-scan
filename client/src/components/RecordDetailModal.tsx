import { formatCurrency } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RecordDetailModalProps {
  record: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function RecordDetailModal({ record, isOpen, onClose }: RecordDetailModalProps) {
  const handlePrint = () => {
    window.print();
  };
  
  if (!record) {
    return null;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-gray-900">
            {record.salaryYear}年{record.salaryMonth}月 薪資明細
          </DialogTitle>
          <DialogDescription className="sr-only">
            薪資明細資訊
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">項目</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">明細</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap font-medium">基本薪資</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">-</td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono']">{formatCurrency(record.baseSalary)}</td>
              </tr>
              {record.housingAllowance > 0 && (
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium">住房津貼</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">-</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono']">{formatCurrency(record.housingAllowance)}</td>
                </tr>
              )}
              <tr className={record.housingAllowance > 0 ? '' : 'bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap font-medium">加班費</td>
                <td className="px-6 py-4 whitespace-nowrap text-center font-['Roboto_Mono']">
                  OT1: {record.totalOT1Hours.toFixed(1)}小時, OT2: {record.totalOT2Hours.toFixed(1)}小時
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono']">{formatCurrency(record.totalOvertimePay)}</td>
              </tr>
              {record.holidayDays > 0 && (
                <tr className={record.housingAllowance > 0 ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">假日加班</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center font-['Roboto_Mono']">{record.holidayDays}天</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono']">{formatCurrency(record.totalHolidayPay)}</td>
                </tr>
              )}
              
              {/* Deductions */}
              {record.deductions && record.deductions.map((deduction: any, index: number) => (
                <tr key={deduction.name} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-error">{deduction.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">-</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono'] text-error">
                    {deduction.amount > 0 ? `-${formatCurrency(deduction.amount)}` : '0'}
                  </td>
                </tr>
              ))}
              
              {/* Total */}
              <tr className="bg-gray-100 font-bold">
                <td className="px-6 py-4 whitespace-nowrap">實發金額</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">-</td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-['Roboto_Mono']">{formatCurrency(record.netSalary)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Attendance Records */}
        {record.attendanceData && record.attendanceData.length > 0 && (
          <>
            <h4 className="font-medium mb-2">出勤記錄</h4>
            <div className="bg-gray-50 p-4 rounded-md mb-6 max-h-60 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">上班時間</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">下班時間</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">工作小時</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">加班時數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {record.attendanceData.map((attendance: any, index: number) => {
                    const total = attendance.total || 0;
                    const overtime = attendance.overtime || 0;
                    
                    return (
                      <tr key={index} className={index % 2 === 0 ? '' : 'bg-white'}>
                        <td className="px-4 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">{attendance.date}</td>
                        <td className="px-4 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">{attendance.clockIn}</td>
                        <td className="px-4 py-2 whitespace-nowrap font-['Roboto_Mono'] text-sm">{attendance.clockOut}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-center font-['Roboto_Mono'] text-sm">{8.0}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-center font-['Roboto_Mono'] text-sm">{overtime.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        
        <div className="flex justify-end">
          <Button 
            onClick={handlePrint}
            className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center"
          >
            <span className="material-icons text-sm mr-1">print</span>
            列印明細
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
