import api from '@/lib/api'

/** PB-22/23 — admin scheduling. */
export const listSchedule = (params) => api.get('/schedule', { params }).then((res) => res.data)
export const previewSchedule = (payload) => api.post('/schedule/preview', payload).then((res) => res.data.data)
export const createSchedule = (payload) => api.post('/schedule', payload).then((res) => res.data)
export const cancelSession = (id) => api.delete(`/schedule/${id}`).then((res) => res.data.data)
