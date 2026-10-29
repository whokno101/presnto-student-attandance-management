import api from '@/lib/api'

/** Activity log entries (admin). Filters: facultyId, department, category, action, classId, from, to, search. */
export const listActivity = (params) => api.get('/audit', { params }).then((res) => res.data)

export const getActivity = (id) => api.get(`/audit/${id}`).then((res) => res.data.data)

export const listActionCategories = () => api.get('/audit/actions').then((res) => res.data.data)

/** Attendance submission timeliness per expected session. */
export const listSubmissions = (params) => api.get('/audit/submissions', { params }).then((res) => res.data)
