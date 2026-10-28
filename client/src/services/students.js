import api from '@/lib/api'

/** @param {{search?: string, page?: number, limit?: number}} params */
export const listStudents = (params) => api.get('/students', { params }).then((res) => res.data)

export const createStudent = (payload) => api.post('/students', payload).then((res) => res.data.data)

export const updateStudent = (id, payload) =>
  api.put(`/students/${id}`, payload).then((res) => res.data.data)

export const deactivateStudent = (id) => api.delete(`/students/${id}`).then((res) => res.data.data)

export const activateStudent = (id) =>
  api.put(`/students/${id}`, { isActive: true }).then((res) => res.data.data)
