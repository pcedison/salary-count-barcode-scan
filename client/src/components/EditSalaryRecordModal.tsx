import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface EditSalaryRecordModalProps {
  record: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: any) => Promise<void>;
  isSaving: boolean;
}

export default function EditSalaryRecordModal({ 
  record, 
  isOpen, 
  onClose, 
  onSave,
  isSaving 
}: EditSalaryRecordModalProps) {
  const [formData, setFormData] = useState({
    baseSalary: 0,
    totalOT1Hours: 0,
    totalOT2Hours: 0,
    holidayDays: 0,
  });

  useEffect(() => {
    if (record) {
      setFormData({
        baseSalary: record.baseSalary || 0,
        totalOT1Hours: record.totalOT1Hours || 0,
        totalOT2Hours: record.totalOT2Hours || 0,
        holidayDays: record.holidayDays || 0,
      });
    }
  }, [record]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: parseFloat(value) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;

    try {
      // 計算派生值
      const overtimeHourlyRate = (record.baseMonthSalary / 30 / 8) * 1.34;
      const totalOvertimePay = 
        (formData.totalOT1Hours * overtimeHourlyRate * 1.34) + 
        (formData.totalOT2Hours * overtimeHourlyRate * 1.67);
      
      const holidayDailySalary = record.baseMonthSalary / 30;
      const totalHolidayPay = formData.holidayDays * holidayDailySalary;
      
      const grossSalary = formData.baseSalary + totalOvertimePay + totalHolidayPay;
      
      // 計算總扣除金額
      const totalDeductions = record.deductions?.reduce(
        (sum: number, deduction: { amount: number }) => sum + deduction.amount, 
        0
      ) || 0;
      
      const netSalary = grossSalary - totalDeductions;
      
      // 送出更新
      await onSave(record.id, {
        baseSalary: formData.baseSalary,
        totalOT1Hours: formData.totalOT1Hours,
        totalOT2Hours: formData.totalOT2Hours,
        holidayDays: formData.holidayDays,
        totalOvertimePay,
        totalHolidayPay,
        grossSalary,
        totalDeductions,
        netSalary
      });
    } catch (error) {
      console.error('Error updating record:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>編輯薪資紀錄</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="text-center text-lg font-medium mb-4">
            {record?.salaryYear}年{record?.salaryMonth}月薪資
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="baseSalary">基本薪資</Label>
              <Input
                id="baseSalary"
                name="baseSalary"
                type="number"
                value={formData.baseSalary}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="totalOT1Hours">1.34倍加班時數</Label>
              <Input
                id="totalOT1Hours"
                name="totalOT1Hours"
                type="number"
                step="0.1"
                value={formData.totalOT1Hours}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="totalOT2Hours">1.67倍加班時數</Label>
              <Input
                id="totalOT2Hours"
                name="totalOT2Hours"
                type="number"
                step="0.1"
                value={formData.totalOT2Hours}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="holidayDays">假日加班天數</Label>
              <Input
                id="holidayDays"
                name="holidayDays"
                type="number"
                step="1"
                value={formData.holidayDays}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="border-t pt-4 mt-6">
            <div className="text-sm text-gray-500 mb-2">基於您的編輯，系統將自動重新計算：</div>
            <ul className="text-sm text-gray-500 list-disc pl-5 space-y-1">
              <li>加班費總額</li>
              <li>假日加班費總額</li>
              <li>總薪資</li>
              <li>扣除額</li>
              <li>實發金額</li>
            </ul>
          </div>
          
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              取消
            </Button>
            <Button 
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? (
                <div className="flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  儲存中...
                </div>
              ) : (
                '儲存修改'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}