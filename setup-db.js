// Import the createClient function from the @supabase/supabase-js package
import { createClient } from '@supabase/supabase-js';

// 導入共享常量
import { constants } from './shared/constants.js';

// Get the environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Create a Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SQL statements to create the necessary tables
const setupSQL = `
-- Drop tables if they exist to avoid errors
DROP TABLE IF EXISTS temporary_attendance;
DROP TABLE IF EXISTS salary_records;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS holidays;

-- Create temporary_attendance table
CREATE TABLE IF NOT EXISTS temporary_attendance (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT NOT NULL,
  is_holiday BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  base_hourly_rate NUMERIC NOT NULL DEFAULT 119,
  ot1_multiplier NUMERIC NOT NULL DEFAULT 1.34,
  ot2_multiplier NUMERIC NOT NULL DEFAULT 1.67,
  base_month_salary NUMERIC NOT NULL DEFAULT 28590,
  deductions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create salary_records table
CREATE TABLE IF NOT EXISTS salary_records (
  id SERIAL PRIMARY KEY,
  salary_year INTEGER NOT NULL,
  salary_month INTEGER NOT NULL,
  base_salary NUMERIC NOT NULL,
  housing_allowance NUMERIC DEFAULT 0,
  total_ot1_hours NUMERIC NOT NULL DEFAULT 0,
  total_ot2_hours NUMERIC NOT NULL DEFAULT 0,
  total_overtime_pay NUMERIC NOT NULL DEFAULT 0,
  holiday_days INTEGER NOT NULL DEFAULT 0,
  holiday_daily_salary NUMERIC NOT NULL DEFAULT 0,
  total_holiday_pay NUMERIC NOT NULL DEFAULT 0,
  gross_salary NUMERIC NOT NULL,
  deductions JSONB DEFAULT '[]'::jsonb,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_salary NUMERIC NOT NULL,
  attendance_data JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (base_hourly_rate, ot1_multiplier, ot2_multiplier, base_month_salary, deductions)
VALUES (
  119, 
  1.34, 
  1.67, 
  28590, 
  '[{"name": "勞保費", "amount": 525, "description": "勞工保險費用"}, {"name": "健保費", "amount": 372, "description": "全民健康保險費用"}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
`;

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');
    
    // Split our big SQL into separate statements to execute individually
    
    // Create temporary_attendance table
    console.log('Creating temporary_attendance table...');
    const { error: error1 } = await supabase.from(constants.TEMP_TABLE_NAME).insert({
      date: '2025/01/01',
      clock_in: '08:00',
      clock_out: '17:00',
      is_holiday: false
    }).select();
    
    if (error1) {
      console.log('Error with temporary_attendance, might need to create it first...');
      // Try direct query via fetch API
      const res1 = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          query: `
          CREATE TABLE IF NOT EXISTS temporary_attendance (
            id SERIAL PRIMARY KEY,
            date TEXT NOT NULL,
            clock_in TEXT NOT NULL,
            clock_out TEXT NOT NULL,
            is_holiday BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );`
        })
      });
      console.log('Result of creating temporary_attendance:', await res1.text());
    }
    
    // Create settings table
    console.log('Creating settings table...');
    const { error: error2 } = await supabase.from(constants.SETTINGS_TABLE_NAME).insert({
      base_hourly_rate: constants.BASE_HOURLY_RATE,
      ot1_multiplier: constants.OT1_MULTIPLIER,
      ot2_multiplier: constants.OT2_MULTIPLIER,
      base_month_salary: constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_DAYS * constants.STANDARD_WORK_HOURS,
      deductions: [
        { name: "勞保費", amount: constants.DEFAULT_LABOR_INSURANCE, description: "勞工保險費用" },
        { name: "健保費", amount: constants.DEFAULT_HEALTH_INSURANCE, description: "全民健康保險費用" }
      ]
    }).select();
    
    if (error2) {
      console.log('Error with settings, trying to create table...');
      // Try direct query via fetch API
      const res2 = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          query: `
          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            base_hourly_rate NUMERIC NOT NULL DEFAULT ${constants.BASE_HOURLY_RATE},
            ot1_multiplier NUMERIC NOT NULL DEFAULT ${constants.OT1_MULTIPLIER},
            ot2_multiplier NUMERIC NOT NULL DEFAULT ${constants.OT2_MULTIPLIER},
            base_month_salary NUMERIC NOT NULL DEFAULT ${constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_DAYS * constants.STANDARD_WORK_HOURS},
            deductions JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO settings (base_hourly_rate, ot1_multiplier, ot2_multiplier, base_month_salary, deductions)
          VALUES (
            ${constants.BASE_HOURLY_RATE}, 
            ${constants.OT1_MULTIPLIER}, 
            ${constants.OT2_MULTIPLIER}, 
            ${constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_DAYS * constants.STANDARD_WORK_HOURS}, 
            '[{"name": "勞保費", "amount": ${constants.DEFAULT_LABOR_INSURANCE}, "description": "勞工保險費用"}, {"name": "健保費", "amount": ${constants.DEFAULT_HEALTH_INSURANCE}, "description": "全民健康保險費用"}]'::jsonb
          )
          ON CONFLICT (id) DO NOTHING;`
        })
      });
      console.log('Result of creating settings:', await res2.text());
    }
    
    // Create salary_records table
    console.log('Creating salary_records table...');
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // 計算基本薪資
    const baseSalary = constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_DAYS * constants.STANDARD_WORK_HOURS;
    
    const { error: error3 } = await supabase.from(constants.FINAL_TABLE_NAME).insert({
      salary_year: currentYear,
      salary_month: currentMonth,
      base_salary: baseSalary,
      housing_allowance: constants.DEFAULT_HOUSING_ALLOWANCE,
      total_ot1_hours: 0,
      total_ot2_hours: 0,
      total_overtime_pay: 0,
      holiday_days: 0,
      holiday_daily_salary: 0,
      total_holiday_pay: 0,
      gross_salary: baseSalary,
      deductions: [],
      total_deductions: 0,
      net_salary: baseSalary,
      attendance_data: []
    }).select();
    
    if (error3) {
      console.log('Error with salary_records, trying to create table...');
      // Try direct query via fetch API
      const res3 = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          query: `
          CREATE TABLE IF NOT EXISTS salary_records (
            id SERIAL PRIMARY KEY,
            salary_year INTEGER NOT NULL,
            salary_month INTEGER NOT NULL,
            base_salary NUMERIC NOT NULL,
            housing_allowance NUMERIC DEFAULT 0,
            total_ot1_hours NUMERIC NOT NULL DEFAULT 0,
            total_ot2_hours NUMERIC NOT NULL DEFAULT 0,
            total_overtime_pay NUMERIC NOT NULL DEFAULT 0,
            holiday_days INTEGER NOT NULL DEFAULT 0,
            holiday_daily_salary NUMERIC NOT NULL DEFAULT 0,
            total_holiday_pay NUMERIC NOT NULL DEFAULT 0,
            gross_salary NUMERIC NOT NULL,
            deductions JSONB DEFAULT '[]'::jsonb,
            total_deductions NUMERIC NOT NULL DEFAULT 0,
            net_salary NUMERIC NOT NULL,
            attendance_data JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );`
        })
      });
      console.log('Result of creating salary_records:', await res3.text());
    }
    
    // Create holidays table
    console.log('Creating holidays table...');
    const { error: error4 } = await supabase.from(constants.HOLIDAYS_TABLE_NAME).insert({
      date: '2025/01/01',
      description: '元旦'
    }).select();
    
    if (error4) {
      console.log('Error with holidays, trying to create table...');
      // Try direct query via fetch API
      const res4 = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        },
        body: JSON.stringify({
          query: `
          CREATE TABLE IF NOT EXISTS holidays (
            id SERIAL PRIMARY KEY,
            date TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO holidays (date, description)
          VALUES ('2025/01/01', '元旦')
          ON CONFLICT (id) DO NOTHING;`
        })
      });
      console.log('Result of creating holidays:', await res4.text());
    }
    
    console.log('Database setup complete!');
    
    // Verify by checking one of the tables
    const { data, error } = await supabase.from(constants.SETTINGS_TABLE_NAME).select('*').limit(1);
    if (error) {
      console.error('Error verifying tables:', error);
    } else {
      console.log('Settings data:', data);
    }
    
  } catch (error) {
    console.error('Error executing database setup:', error);
  }
}

// Run the setup function
setupDatabase();