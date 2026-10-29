import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '@/components/layout/AppLayout'
import RequireAuth from '@/components/auth/RequireAuth'
import RequireRole from '@/components/auth/RequireRole'
import Login from '@/pages/Login'
import Unauthorized from '@/pages/Unauthorized'
import NotFound from '@/pages/NotFound'
import { useAuth } from '@/context/AuthContext'
import { homeFor } from '@/lib/navigation'

// Each page is its own chunk, so a role only downloads the screens it uses
// (charts, QR and camera code stay out of the initial bundle).
const MyClasses = lazy(() => import('@/pages/MyClasses'))
const Reports = lazy(() => import('@/pages/Reports'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const DataExchange = lazy(() => import('@/pages/DataExchange'))
const Excuses = lazy(() => import('@/pages/student/Excuses'))
const ExcuseReview = lazy(() => import('@/pages/faculty/ExcuseReview'))
const Analytics = lazy(() => import('@/pages/admin/Analytics'))
const Schedule = lazy(() => import('@/pages/admin/Schedule'))
const QrCheckin = lazy(() => import('@/pages/faculty/QrCheckin'))
const CheckIn = lazy(() => import('@/pages/student/CheckIn'))
const Insights = lazy(() => import('@/pages/faculty/Insights'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AttendanceOverview = lazy(() => import('@/pages/admin/AttendanceOverview'))
const ActivityLog = lazy(() => import('@/pages/admin/ActivityLog'))
const ManageStudents = lazy(() => import('@/pages/admin/ManageStudents'))
const ManageFaculty = lazy(() => import('@/pages/admin/ManageFaculty'))
const ManageClasses = lazy(() => import('@/pages/admin/ManageClasses'))
const MarkAttendance = lazy(() => import('@/pages/faculty/MarkAttendance'))
const EnrollClasses = lazy(() => import('@/pages/student/EnrollClasses'))
const MyAttendance = lazy(() => import('@/pages/student/MyAttendance'))

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
          path="/attendance/qr/:id"
          element={
            <RequireRole roles={['admin', 'faculty']}>
              <QrCheckin />
            </RequireRole>
          }
        />
        <Route
          path="/check-in"
          element={
            <RequireRole roles={['student']}>
              <CheckIn />
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
