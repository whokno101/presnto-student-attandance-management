import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Sortable column header. `sort` is { key, dir }; clicking the active column
 * flips direction, another column starts at its `defaultDir`.
 * aria-sort tells screen readers the current order.
 */
export default function SortHeader({ label, column, sort, onSort, defaultDir = 'asc', className }) {
  const active = sort.key === column
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown

  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('-ml-3 h-8 px-2', active && 'text-foreground')}
        onClick={() => onSort(active ? { key: column, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: column, dir: defaultDir })}
      >
        {label}
        <Icon className={cn('ml-1 h-3.5 w-3.5', !active && 'text-muted-foreground')} aria-hidden="true" />
      </Button>
    </TableHead>
  )
}
