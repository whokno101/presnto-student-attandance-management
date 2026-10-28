import api from '@/lib/api'

export const getAdminStats = () => api.get('/admin/stats').then((res) => res.data.data)
