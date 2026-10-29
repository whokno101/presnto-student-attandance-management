import { useEffect, useState } from 'react'

import { useAuth } from '@/context/AuthContext'
import { listClasses, listMyClasses } from '@/services/classes'
import { listFaculty } from '@/services/faculty'

/**
 * Options for report filters. Admins get every faculty member and every class
 * (archived ones labelled); faculty get only their own classes.
 */
export default function useFilterOptions({ includeArchived = true } = {}) {
  const { user } = useAuth()
  const [faculty, setFaculty] = useState([])
  const [classes, setClasses] = useState([])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (user?.role === 'admin') {
          const [facultyRes, classRes] = await Promise.all([
            listFaculty({ limit: 100 }),
            listClasses({ limit: 100, status: includeArchived ? 'all' : 'active' }),
          ])
          if (!active) return
          setFaculty(facultyRes.data.map((f) => ({ value: f.id, label: f.name })))
          setClasses(classRes.data.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}${c.archived ? ' (archived)' : ''}` })))
        } else if (user?.role === 'faculty') {
          const rows = await listMyClasses()
          if (!active) return
          setClasses(rows.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })))
        }
      } catch {
        // Filters degrade to "All" only; the page itself reports load errors.
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user?.role, includeArchived])

  return { faculty, classes }
}
