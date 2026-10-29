import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '@/components/layout/AppLayout'
import RequireAuth from '@/components/auth/RequireAuth'
import RequireRole from '@/components/auth/RequireRole'
import Login from '@/pages/Login'
import Unauthorized from '@/pages/Unauthorized'
import NotFound from '@/pages/NotFound'
import MyClasses from '@/pages/MyClasses'
import Reports from '@/pages/Reports'
import Notifications from '@/pages/Notifications'
import DataExchange from '@/pages/DataExchange'
import Excuses from '@/pages/student/Excuses'
import ExcuseReview from '@/pages/faculty/ExcuseReview'
import Analytics from '@/pages/admin/Analytics'
import Schedule from '@/pages/admin/Schedule'
import Insights from '@/pages/faculty/Insights'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AttendanceOverview from '@/pages/admin/AttendanceOverview'
import ActivityLog from '@/pages/admin/ActivityLog'
import ManageStudents from '@/pages/admin/ManageStudents'
import ManageFaculty from '@/pages/admin/ManageFaculty'
import ManageClasses from '@/pages/admin/ManageClasses'
import MarkAttendance from '@/pages/faculty/MarkAttendance'
import EnrollClasses from '@/pages/student/EnrollClasses'
import MyAttendance from '@/pages/student/MyAttendance'
import { useAuth } from '@/context/AuthContext'
import { homeFor } from '@/lib/navigation'

/** `/` sends each role to its own landing page. */
function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={homeFor(user?.role)} replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/403" element={<Unauthorized />} />

      {/* Authenticated shell — every child also declares its allowed roles. */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRedirect />} />

        <Route
          path="/admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/admin/attendance"
          element={
            <RequireRole roles={['admin']}>
              <AttendanceOverview />
            </RequireRole>
          }
        />
        <Route
          path="/admin/activity"
          element={
            <RequireRole roles={['admin']}>
              <ActivityLog />
            </RequireRole>
          }
        />
        <Route
          path="/admin/students"
          element={
            <RequireRole roles={['admin']}>
              <ManageStudents />
            </RequireRole>
          }
        />
        <Route
          path="/admin/faculty"
          element={
            <RequireRole roles={['admin']}>
              <ManageFaculty />
            </RequireRole>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <RequireRole roles={['admin']}>
              <ManageClasses />
            </RequireRole>
          }
        />

        <Route
          path="/classes"
          element={
            <RequireRole roles={['faculty', 'student']}>
              <MyClasses />
            </RequireRole>
          }
        />
        <Route
          path="/admin/schedule"
          element={
            <RequireRole roles={['admin']}>
              <Schedule />
            </RequireRole>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <RequireRole roles={['admin']}>
              <Analytics />
            </RequireRole>
          }
        />
        <Route
          path="/insights"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <Insights />
            </RequireRole>
          }
        />
        <Route path="/notifications" element={<Notifications />} />
        <Route
          path="/data"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <DataExchange />
            </RequireRole>
          }
        />
        <Route
          path="/excuses/review"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <ExcuseReview />
            </RequireRole>
          }
        />
        <Route
          path="/excuses"
          element={
            <RequireRole roles={['student']}>
              <Excuses />
            </RequireRole>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <Reports />
            </RequireRole>
          }
        />
        {/* Admins may also mark attendance (see the API permission matrix). */}
        <Route
          path="/attendance/mark"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <MarkAttendance />
            </RequireRole>
          }
        />

        <Route
          path="/enroll"
          element={
            <RequireRole roles={['student']}>
              <EnrollClasses />
            </RequireRole>
          }
        />
        <Route
          path="/my-attendance"
          element={
            <RequireRole roles={['student']}>
              <MyAttendance />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
