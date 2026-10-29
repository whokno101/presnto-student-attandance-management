import { CheckCircle2, Clock, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

const META = {
  pending: { label: 'Pending review', variant: 'secondary', icon: Clock },
  approved: { label: 'Approved', variant: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
}

/** Excuse status with an icon and text — never colour alone. */
export default function ExcuseStatusBadge({ status }) {
  const meta = META[status] ?? META.pending
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant}>
      <Icon className="me-1 h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

export const EXCUSE_CATEGORIES = [
  { value: 'illness', label: 'Illness or medical' },
  { value: 'family', label: 'Family emergency' },
  { value: 'university_activity', label: 'University activity' },
  { value: 'transport', label: 'Transport disruption' },
  { value: 'other', label: 'Other' },
]
