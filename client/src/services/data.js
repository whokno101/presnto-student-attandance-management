import api from '@/lib/api'
import { downloadFromApi } from '@/lib/download'

/** PB-17 datasets the signed-in user may exchange. */
export const listDatasets = () => api.get('/data/datasets').then((res) => res.data.data)

export const exportDataset = (dataset) => downloadFromApi(`/data/export/${dataset}`, {}, `${dataset}.csv`)

export const downloadTemplate = (dataset) => downloadFromApi(`/data/template/${dataset}`, {}, `${dataset}-template.csv`)

export const previewImport = (dataset, payload) => api.post(`/data/import/${dataset}/preview`, payload, { timeout: 60000 }).then((res) => res.data.data)

export const commitImport = (dataset, payload) => api.post(`/data/import/${dataset}/commit`, payload, { timeout: 120000 }).then((res) => res.data.data)
