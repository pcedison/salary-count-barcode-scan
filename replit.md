# Employee Salary Management System

## Overview

This is a comprehensive employee salary calculation and attendance management system designed for small to medium-sized businesses. The system provides complete attendance tracking, overtime calculation, and salary reporting functionality with a two-tier storage architecture supporting both temporary and permanent data records.

## System Architecture

### Technology Stack

**Frontend:**
- React 18 with TypeScript for modern component-based UI
- Vite for fast development and build tooling
- Tailwind CSS + shadcn/ui for consistent, professional styling
- TanStack Query for efficient data fetching and state management
- React Hook Form + Zod for robust form handling and validation
- Wouter for lightweight client-side routing

**Backend:**
- Node.js with Express.js for RESTful API services
- TypeScript for type-safe server-side development
- Drizzle ORM for database operations and migrations
- Passport.js for session-based authentication
- Custom admin authentication with PIN-based access control

**Database:**
- Primary: Supabase (PostgreSQL in the cloud) for production reliability
- Fallback: Local PostgreSQL for development and backup scenarios
- Automatic failover between Supabase and PostgreSQL

### Storage Architecture

The system currently uses a single primary database:

1. **Primary Database (Neon)**: Cloud-based PostgreSQL providing reliable performance and data persistence
2. **Supabase Integration Status**: Currently facing connection authentication issues ("Tenant or user not found" errors)
3. **Current Solution**: Using Neon database with confirmed 5 historical salary records (2025年 3-7月)

## Key Components

### Employee Management
- Comprehensive employee data management with encrypted ID storage
- Department and position tracking
- Active/inactive status management
- Caesar cipher encryption for sensitive personal data (ID numbers)

### Attendance System
- **Barcode Scanner Integration**: Physical barcode scanner support for quick clock-in/out
- **Manual Time Entry**: Web-based interface for manual attendance recording
- **Real-time Tracking**: Live display of current attendance status
- **Flexible Time Recording**: Support for partial days, overtime, and holiday work

### Salary Calculation Engine
- **Multi-tier Overtime**: Automatic calculation of OT1 (1.34x rate) and OT2 (1.67x rate)
- **Daily Calculation Method**: Compliant with labor regulations - calculates overtime daily then aggregates
- **Holiday Pay**: Special rates for weekend and holiday work
- **Deduction Management**: Configurable deductions for labor insurance, health insurance, etc.
- **Allowances**: Support for welfare and housing allowances

### Reporting & Export
- **Monthly Salary Reports**: Detailed breakdowns with all calculation components
- **CSV Export**: Full data export capability for external analysis
- **Print-friendly Views**: Optimized layouts for physical document printing
- **Historical Records**: Complete audit trail of all salary calculations

## Data Flow

### Attendance Processing
1. **Input**: Barcode scan or manual entry creates temporary attendance record
2. **Validation**: System validates employee ID and time entries
3. **Processing**: Calculate work hours, overtime hours (OT1/OT2), and special conditions
4. **Storage**: Store in temporary_attendance table for editing and review

### Salary Calculation
1. **Data Aggregation**: Collect all attendance records for the specified month
2. **Overtime Calculation**: Apply daily calculation method with proper rounding
3. **Allowances & Deductions**: Add configured allowances and subtract deductions
4. **Final Calculation**: Generate gross and net salary amounts
5. **Record Storage**: Save complete calculation details in salary_records table

### Data Synchronization
- **Cross-device Sync**: Supabase ensures data consistency across multiple devices
- **Backup Strategy**: Automated daily, weekly, and monthly backups
- **Data Recovery**: Multiple restoration points and integrity checking

## External Dependencies

### Cloud Services
- **Supabase**: Primary database hosting with built-in authentication and real-time features
- **Optional: Google Drive Integration**: For cloud backup storage (configuration required)

### Hardware Integration
- **USB Barcode Scanners**: Direct support for standard USB HID barcode scanners
- **Raspberry Pi Support**: Dedicated scripts for Raspberry Pi-based barcode scanning stations

### Third-party Libraries
- **@supabase/supabase-js**: Official Supabase client library
- **drizzle-orm**: Modern TypeScript ORM for database operations
- **@tanstack/react-query**: Data synchronization and caching
- **zod**: Runtime type validation and schema definition

## Deployment Strategy

### Environment Configuration
The system supports multiple deployment scenarios:

**Development Environment:**
- Local PostgreSQL database
- Hot module replacement via Vite
- Development-specific logging and debugging

**Production Environment:**
- Supabase cloud database as primary
- Express.js serving static files
- Comprehensive error handling and logging
- Automated backup and monitoring systems

### Database Setup Options

**Option A: Supabase (Recommended)**
1. Create Supabase project at supabase.com
2. Configure connection details in `supabase_config.json`
3. Run database migrations via provided SQL scripts
4. Enable automatic backup and monitoring features

**Option B: Local PostgreSQL**
1. Install PostgreSQL 12+ on target system
2. Create database and user with appropriate permissions
3. Configure DATABASE_URL environment variable
4. Run migrations using Drizzle kit

### Scaling Considerations
- **Multi-department Support**: System designed for expansion across multiple departments
- **User Access Control**: PIN-based admin authentication with operation logging
- **Data Archival**: Configurable retention policies for historical data
- **Performance Optimization**: Query caching and connection pooling for high-load scenarios

## Changelog

- November 3, 2025. **Enhanced Holiday Management with Labor Law Compliance**: Implemented comprehensive holiday type system with Taiwan labor law-compliant salary deductions
  - Database schema updated: replaced `workedOnHoliday` boolean with `holidayType` enum (worked/sick_leave/personal_leave/national_holiday)
  - Frontend UI enhanced: dropdown selector for holiday types with color-coded badges
  - Salary calculation updated with Taiwan labor law compliance:
    - Sick leave: 50% pay deduction (calculated as monthly salary ÷ 30 days × 50%)
    - Personal leave: Full pay deduction (monthly salary ÷ 30 days × 100%)
    - National holidays: Base pay included, no extra payment
    - Worked holidays: Standard holiday overtime premium calculation
  - Backend routes updated to automatically add leave deductions as line items in salary records
  - Fixed double-deduction bug in PATCH operations with idempotent recalculation
  - Added comprehensive audit logging for leave deductions
- October 1, 2025. **Critical Performance Optimization**: Barcode attendance scanning response time reduced by 83% (from 5+ seconds to ~0.8 seconds)
  - Converted /api/barcode-scan from asynchronous background processing to synchronous direct response
  - Eliminated artificial 5-second delay from inProgress polling mechanism
  - Removed redundant employee database query in barcode scan flow
  - Frontend now receives immediate results without waiting for background processing
  - Performance bottleneck identified as cloud database latency (Neon), which is within normal range for cloud databases
- June 30, 2025. Initial setup

## User Preferences

Preferred communication style: Neutral, professional tone without excessive praise or emojis. Focus on task completion and technical accuracy.