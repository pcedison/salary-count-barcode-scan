# Employee Payroll Management System - Design Guidelines

## Design Approach: System-Based (Productivity-Focused)

**Primary Framework**: shadcn/ui + Tailwind CSS
**Design Reference**: Linear, Notion - clean, data-dense productivity interfaces
**Philosophy**: Maximize information density while maintaining clarity and scannability

---

## Typography Hierarchy

**Font Stack**: 
- Primary: `font-sans` (system fonts for CJK support)
- Code/Numbers: `font-mono` for tabular data alignment

**Scale**:
- Page Headers: `text-2xl font-semibold` (24px)
- Section Titles: `text-lg font-medium` (18px)
- Table Headers: `text-sm font-medium uppercase tracking-wide` (14px)
- Body/Table Cells: `text-sm` (14px)
- Helper Text: `text-xs text-muted-foreground` (12px)

---

## Layout & Spacing System

**Spacing Primitives**: Use Tailwind units: `2, 3, 4, 6, 8` consistently
- Component padding: `p-4` or `p-6`
- Section spacing: `space-y-6` or `space-y-8`
- Table cell padding: `px-4 py-3`
- Form gaps: `gap-4`

**Container Strategy**:
- Main content: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Sidebar: Fixed `w-64` left navigation
- Content area: `flex-1` with proper overflow handling

---

## Application Structure

### Navigation Layout
**Left Sidebar** (`w-64 border-r`):
- Logo/Company name at top (`p-6`)
- Navigation items with icons (Heroicons)
- Menu items: 員工管理, 考勤記錄, 薪資計算, 報表分析, 系統設定
- Active state: `bg-accent` with `font-medium`

**Top Bar** (`h-16 border-b`):
- Breadcrumb navigation
- Search functionality
- User profile dropdown (right-aligned)
- Notification bell icon

---

## Core Components

### Attendance Table with Holiday Marking

**Table Container**: 
- Use shadcn/ui `<Table>` component with `border rounded-lg` wrapper
- Sticky header: `sticky top-0 bg-background z-10`
- Alternating rows: Subtle `hover:bg-muted/50` transition

**Column Structure**:
1. 員工編號 (Employee ID) - `w-24`
2. 姓名 (Name) - `w-40`
3. 日期 (Date) - `w-32`
4. 上班時間 (Clock In) - `w-28`
5. 下班時間 (Clock Out) - `w-28`
6. 工時 (Hours) - `w-20 font-mono`
7. **假日類型 (Holiday Type)** - `w-40` **NEW DROPDOWN**
8. 操作 (Actions) - `w-24`

**Holiday Type Dropdown Implementation**:
- Use shadcn/ui `<Select>` component
- Trigger: `h-9 text-sm` minimal button style
- Options: `病假 (Sick Leave)`, `事假 (Personal Leave)`, `假日出勤 (Holiday Work)`, `正常出勤 (Regular)`
- Default state: Shows current status or `--未標記--`
- Visual indicators: Small colored dot prefix (don't specify colors, but different states use different dots)

**Status Badges**: Use shadcn/ui `<Badge>` for attendance status
- Variants: `default`, `secondary`, `outline`
- Display work hours summary, overtime indicators

---

## Form Components

**Filter Bar** (above table):
- Date range picker (shadcn/ui DatePicker)
- Department dropdown
- Employee search input
- Export button (aligned right)
- Layout: `flex items-center gap-3 mb-6`

**Bulk Actions Bar** (appears on row selection):
- Sticky bottom positioning
- "已選擇 X 筆記錄" counter
- Batch holiday type assignment
- Cancel selection button

---

## Data Visualization Cards

**Dashboard Summary Cards** (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`):
- Total employees count
- Monthly attendance rate
- Pending approvals
- Payroll overview
- Each card: `p-6 border rounded-lg` with icon, large number `text-3xl font-bold`, and trend indicator

---

## Responsive Behavior

**Desktop (lg:)**: Full sidebar + table layout
**Tablet (md:)**: Collapsible sidebar, horizontal scroll for table
**Mobile**: Hidden sidebar (hamburger menu), stacked cards, simplified table view with expandable rows

---

## Interaction Patterns

- **Inline Editing**: Click cell to edit (overtime adjustments, notes)
- **Quick Actions**: Hover row reveals action buttons (edit, delete, history)
- **Toast Notifications**: shadcn/ui Toast for save confirmations
- **Loading States**: Skeleton screens for table data loading
- **Empty States**: Centered illustrations with helpful text when no records

---

## Accessibility

- All dropdowns keyboard navigable (Tab, Arrow keys, Enter)
- Table headers with proper `scope` attributes
- Form labels clearly associated with inputs
- Focus states visible with `ring-2 ring-ring ring-offset-2`
- Consistent focus trap in modals

---

**No Images Required** - This is a data-heavy internal tool where imagery would be distracting. Focus on clean typography, well-structured tables, and efficient data entry flows.