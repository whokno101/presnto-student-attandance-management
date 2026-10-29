import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva('block font-display text-[0.8rem] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70')

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
