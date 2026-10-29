import { useEffect, useState } from 'react'

import api from '@/lib/api'

/**
 * Institution policy from GET /api/policy (time zone + thresholds), fetched
 * once per session and shared by every caller. The defaults mirror
 * server/config/policy.js so first paint never shows wrong numbers.
 */
export const DEFAULT_POLICY = {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  sessionWarningRate: 60,
  studentRiskRate: 75,
  riskMinUnexcusedAbsences: 4,
  excludeExcusedFromDenominator: true,
  retentionDays: 90,
  overdueAfterHours: 24,
  qrRotationSeconds: 15,
  facultyImportEnabled: true,
}

let cached = null
let inflight = null

export const loadPolicy = () => {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = api
      .get('/policy')
      .then((res) => {
        cached = { ...DEFAULT_POLICY, ...res.data.data }
        return cached
      })
      .catch(() => DEFAULT_POLICY)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export default function usePolicy() {
  const [policy, setPolicy] = useState(cached ?? DEFAULT_POLICY)

  useEffect(() => {
    let active = true
    loadPolicy().then((value) => {
      if (active) setPolicy(value)
    })
    return () => {
      active = false
    }
  }, [])

  return policy
}
