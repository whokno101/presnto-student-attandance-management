import {
  BarChart3,
  Bell,
  LineChart,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileCheck2,
  FileText,
  ArrowLeftRight,
  FileBarChart,
  GraduationCap,
  History,
  LayoutDashboard,
  UserPlus,
  Users,
} from 'lucide-react'

/** Landing route per role — used after login and by the logo link. */
export const ROLE_HOME = {
  admin: '/admin',
  faculty: '/classes',
  student: '/enroll',
}

export const homeFor = (role) => ROLE_HOME[role] || '/login'

/**
 * Single source of truth for the sidebar. Filtering by `roles` is what makes the
 * menu role-aware — the same array drives the routes' guards in App.jsx.
 */
export const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'], end: true },
  { to: '/admin/students', label: 'Manage Students', icon: Users, roles: ['admin'] },
  { to: '/admin/faculty', label: 'Manage Faculty', icon: GraduationCap, roles: ['admin'] },
  { to: '/admin/classes', label: 'Manage Classes', icon: BookOpen, roles: ['admin'] },
  { to: '/admin/attendance', label: 'Attendance Overview', icon: BarChart3, roles: ['admin'] },
  { to: '/admin/analytics', label: 'Analytics', icon: LineChart, roles: ['admin'] },
  { to: '/reports', label: 'Attendance Reports', icon: FileBarChart, roles: ['admin'] },
  { to: '/excuses/review', label: 'Excuse Review', icon: FileCheck2, roles: ['admin'] },
  { to: '/data', label: 'Import / Export', icon: ArrowLeftRight, roles: ['admin'] },
  { to: '/admin/activity', label: 'Activity Log', icon: History, roles: ['admin'] },
  { to: '/enroll', label: 'Enroll in Classes', icon: UserPlus, roles: ['student'] },
  { to: '/classes', label: 'My Classes', icon: BookOpen, roles: ['faculty', 'student'] },
  { to: '/attendance/mark', label: 'Mark Attendance', icon: ClipboardCheck, roles: ['faculty'] },
  { to: '/insights', label: 'Insights', icon: LineChart, roles: ['faculty'] },
  { to: '/reports', label: 'Class Reports', icon: FileBarChart, roles: ['faculty'] },
  { to: '/excuses/review', label: 'Excuse Review', icon: FileCheck2, roles: ['faculty'] },
  { to: '/data', label: 'Import / Export', icon: ArrowLeftRight, roles: ['faculty'] },
  { to: '/my-attendance', label: 'My Attendance', icon: CalendarCheck, roles: ['student'] },
  { to: '/excuses', label: 'Absence Excuses', icon: FileText, roles: ['student'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'faculty', 'student'] },
]

export const navItemsFor = (role) => NAV_ITEMS.filter((item) => item.roles.includes(role))

export const ROLE_LABEL = { admin: 'Administrator', faculty: 'Faculty', student: 'Student' }
