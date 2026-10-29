import api from '@/lib/api'
import { downloadFromApi } from '@/lib/download'

/** PB-19 — student side */
export const listEligibleAbsences = () => api.get('/excuses/eligible').then((res) => res.data.data)
export const listMyExcuses = () => api.get('/excuses/mine').then((res) => res.data.data)
export const submitExcuse = (payload) => api.post('/excuses', payload, { timeout: 60000 }).then((res) => res.data)

/** PB-19 — review side */
export const listExcusesForReview = (params) => api.get('/excuses', { params }).then((res) => res.data)
export const getExcuse = (id) => api.get(`/excuses/${id}`).then((res) => res.data.data)
export const reviewExcuse = (id, payload) => api.post(`/excuses/${id}/review`, payload).then((res) => res.data)
export const downloadExcuseDocument = (id, filename) => downloadFromApi(`/excuses/${id}/document`, {}, filename)
