import api from '@/lib/api'

export const listClasses = (params) => api.get('/classes', { params }).then((res) => res.data)

export const createClass = (payload) => api.post('/classes', payload).then((res) => res.data.data)

export const updateClass = (id, payload) => api.put(`/classes/${id}`, payload).then((res) => res.data.data)

export const deleteClass = (id) => api.delete(`/classes/${id}`).then((res) => res.data.data)

/** Assign (or unassign with `null`) the teacher of a class — admin only. */
export const assignFaculty = (id, facultyId) =>
  api.put(`/classes/${id}/assign-faculty`, { facultyId }).then((res) => res.data)

/** Admin-only catalog of every class (faculty joined, roster size). */
export const listAllClasses = () => api.get('/classes').then((res) => res.data)

/** The caller's own teaching load / study load. */
export const listMyClasses = () => api.get('/classes/mine').then((res) => res.data.data)

/** Catalog annotated with isEnrolled / isFull / seatsLeft for a student. */
export const listAvailableClasses = (params) =>
  api.get('/classes/available', { params }).then((res) => res.data.data)

export const enrollInClass = (id, studentId) =>
  api.post(`/classes/${id}/enroll`, studentId ? { studentId } : {}).then((res) => res.data)

export const unenrollFromClass = (id, studentId) =>
  api.post(`/classes/${id}/unenroll`, studentId ? { studentId } : {}).then((res) => res.data)
