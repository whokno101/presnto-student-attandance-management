import api from '@/lib/api'
import { downloadFromApi } from '@/lib/download'

/** PB-15 reports: view is 'sessions' | 'students' | 'records'. */
export const getReport = (view, params) => api.get(`/reports/${view}`, { params }).then((res) => res.data)

export const exportReport = (view, params) =>
  downloadFromApi(`/reports/${view}`, { ...params, format: 'csv', page: undefined, limit: undefined }, `attendance-${view}.csv`)
