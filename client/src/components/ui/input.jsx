import * as React from 'react'

import { cn } from '@/lib/utils'
import { useFormControlProps } from '@/components/ui/form-control'

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    type={type}
    {...useFormControlProps(props.id)}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-[0.95rem] transition-colors hover:border-foreground/60 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
