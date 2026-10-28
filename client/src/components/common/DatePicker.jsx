import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatPickedDay } from '@/lib/attendance'

/**
 * Single-date picker: a trigger button showing the chosen day, and a calendar
 * in a popover. `maxDate` blocks future dates (attendance cannot be pre-marked).
 */
export default function DatePicker({ id, value, onChange, maxDate, disabled }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-start gap-2 text-left font-normal sm:w-[250px]"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {value ? formatPickedDay(value) : 'Pick a date'}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(day) => day && onChange(day)}
          defaultMonth={value}
          disabled={maxDate ? { after: maxDate } : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
