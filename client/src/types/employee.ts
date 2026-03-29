export interface Employee {
  id: number;
  name: string;
  idNumber: string;
  department: string;
  position: string;
  isEncrypted: boolean;
  active: boolean;
  hourlyRate: number;
  note?: string;
  joinDate?: string;
  leaveDate?: string | null;
  phone?: string;
  specialLeaveDays?: number;
  specialLeaveWorkDateRange?: string;
  specialLeaveUsedDates?: string[];
  specialLeaveCashDays?: number;
  specialLeaveCashMonth?: string;
  specialLeaveNotes?: string;
}
