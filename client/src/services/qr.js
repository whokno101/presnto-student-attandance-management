import api from '@/lib/api'

/** PB-20 — teacher side */
export const startQrSession = (classId) => api.post('/qr/sessions', { classId }).then((res) => res.data.data)
export const getQrToken = (id) => api.get(`/qr/sessions/${id}/token`).then((res) => res.data.data)
export const getQrStatus = (id) => api.get(`/qr/sessions/${id}`).then((res) => res.data.data)
export const closeQrSession = (id) => api.post(`/qr/sessions/${id}/close`).then((res) => res.data.data)

/** PB-20 — student side */
export const checkInWithToken = (token) =>
  api.post('/qr/checkin', { token }, { skipForbiddenRedirect: true }).then((res) => res.data.data)
