import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * Search box with a leading icon. Enter submits immediately; typing is
 * debounced by the parent hook.
 */
export default function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  className = '',
}) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div className={`relative w-full sm:w-80 ${className}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  )
}
