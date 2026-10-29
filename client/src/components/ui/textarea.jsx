import * as React from 'react'

import { cn } from '@/lib/utils'
import { useFormControlProps } from '@/components/ui/form-control'

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    {...useFormControlProps(props.id)}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
