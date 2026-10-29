import * as React from 'react'

import { cn } from '@/lib/utils'
import useStackLabels from '@/hooks/useStackLabels'

/**
 * Below `sm` a table stacks into one card per row, each value labelled with its
 * column header (`.table-stack` in index.css). Pass `stack={false}` for narrow
 * tables that already fit a phone; they keep scrolling sideways instead.
 */
const Table = React.forwardRef(({ className, stack = true, ...props }, ref) => {
  const tableRef = React.useRef(null)
  React.useImperativeHandle(ref, () => tableRef.current)
  useStackLabels(tableRef)

  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={tableRef}
        className={cn('w-full caption-bottom text-sm tabular-nums', stack && 'table-stack', className)}
        {...props}
      />
    </div>
  )
})
Table.displayName = 'Table'

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
))
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn('border-b transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted', className)}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      'h-10 px-3 text-start align-middle font-display text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground [&:has([role=checkbox])]:pe-0',
      className
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-2.5 align-middle [&:has([role=checkbox])]:pe-0', className)} {...props} />
))
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
))
TableCaption.displayName = 'TableCaption'

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
