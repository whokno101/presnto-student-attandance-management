import api from '@/lib/api'

/** Mark (or re-mark) one class for one day. */
export const markAttendance = (payload) =>
  api.post('/attendance/mark', payload).then((res) => res.data)

/** Roster for a class + whatever is already marked on that date. */
export const getClassAttendance = (classId, date) =>
  api.get(`/attendance/class/${classId}`, { params: { date } }).then((res) => res.data.data)

/** The days a class meets: `{ weekdays: ['Monday', …], dates: ['YYYY-MM-DD', …] }`. */
export const getClassDays = (classId) =>
  api.get(`/attendance/class/${classId}/days`).then((res) => res.data.data)

/** The signed-in student's own report (grouped by class). */
export const getMyAttendance = () => api.get('/attendance/my').then((res) => res.data.data)

/** One student's report, for admins or the teacher who owns a shared class. */
export const getStudentAttendance = (studentId) =>
  api.get(`/students/${studentId}/attendance`).then((res) => res.data.data)

/**
 * Admin overview: institution-wide rates, per-class rates and a server-paged
 * per-student table.
 * @param {{search?: string, page?: number, limit?: number, sort?: string, order?: string}} params
 */
export const getAttendanceOverview = (params) =>
  api.get('/attendance/overview', { params }).then((res) => ({
    data: res.data.data,
    pagination: res.data.pagination,
  }))
