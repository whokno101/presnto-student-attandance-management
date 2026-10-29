import api from '@/lib/api'

export const listNotifications = (params) => api.get('/notifications', { params }).then((res) => res.data)

export const getUnreadCount = () => api.get('/notifications/unread-count').then((res) => res.data.data.unread)

export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`).then((res) => res.data.data)

export const markAllNotificationsRead = () => api.post('/notifications/read-all').then((res) => res.data.data)
