import api from '@/lib/api'

/**
 * Downloads a file from an authenticated API endpoint (the bearer token must
 * be sent, so a plain link would not work) and saves it with the server's
 * filename.
 */
export const downloadFromApi = async (url, params, fallbackName = 'export.csv') => {
  const res = await api.get(url, { params, responseType: 'blob' })
  const disposition = res.headers['content-disposition'] || ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match ? match[1] : fallbackName

  const href = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
  return filename
}
