import api from '@/lib/api'

export const listFaculty = (params) => api.get('/faculty', { params }).then((res) => res.data)

export const createFaculty = (payload) => api.post('/faculty', payload).then((res) => res.data.data)

export const updateFaculty = (id, payload) =>
  api.put(`/faculty/${id}`, payload).then((res) => res.data.data)

export const deactivateFaculty = (id) => api.delete(`/faculty/${id}`).then((res) => res.data.data)

export const activateFaculty = (id) =>
  api.put(`/faculty/${id}`, { isActive: true }).then((res) => res.data.data)

/** Active faculty only — used by the Assign Faculty dialog. */
export const listActiveFaculty = () =>
  api.get('/faculty', { params: { isActive: true, limit: 100 } }).then((res) => res.data.data)
