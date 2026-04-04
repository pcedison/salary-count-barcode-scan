export interface Employee {
  id: number;
  name: string;
  idNumber?: string;
  scanIdNumber?: string;
  employeeType?: 'local' | 'foreign';
  department?: string | null;
  position?: string | null;
  isEncrypted?: boolean;
  active: boolean;
  hourlyRate?: number;
  note?: string;
  joinDate?: string;
  leaveDate?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt?: string;
  specialLeaveDays?: number;
  specialLeaveWorkDateRange?: string | null;
  specialLeaveUsedDates?: string[];
  specialLeaveCashDays?: number;
  specialLeaveCashMonth?: string | null;
  specialLeaveNotes?: string | null;
}
