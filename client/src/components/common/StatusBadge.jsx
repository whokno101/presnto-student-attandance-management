import { Badge } from '@/components/ui/badge'

const statusStyles = {
  Active: { variant: 'success', className: '' },
  Inactive: { variant: 'secondary', className: 'text-muted-foreground' },
  'No faculty': { variant: 'secondary', className: 'text-muted-foreground' },
}

export default function StatusBadge({ active }) {
  const label = active ? 'Active' : 'Inactive'
  const style = statusStyles[label]

  return (
    <Badge variant={style.variant} className={style.className}>
      {label}
    </Badge>
  )
}
