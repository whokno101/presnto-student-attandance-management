import api from '@/lib/api'

/** PB-12: aggregate analytics for administrators. */
export const getAdminAnalytics = (params) => api.get('/analytics/admin', { params }).then((res) => res.data)

/** PB-16: class analytics + students at risk for faculty (own classes). */
export const getFacultyInsights = (params) => api.get('/analytics/faculty', { params }).then((res) => res.data)
