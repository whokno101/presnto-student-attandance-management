import { useEffect } from 'react'

// Visible header text; a header that is only screen-reader text (an actions
// column) gives its cells no label in the stacked layout.
const labelOf = (th) => {
  if (!th) return ''
  const hidden = th.querySelector('.sr-only')
  return hidden && hidden.textContent === th.textContent ? '' : th.textContent.trim()
}

/**
 * Copies each column header onto its body cells as `data-label`, which the
 * `.table-stack` styles in index.css print before every value once a table is
 * stacked into cards on phones. Re-runs when rows change (paging, filters).
 */
export default function useStackLabels(tableRef) {
  useEffect(() => {
    const table = tableRef.current
    if (!table) return undefined

    const apply = () => {
      const headers = [...table.querySelectorAll('thead tr:last-child th')]
      table.querySelectorAll('tbody tr').forEach((row) => {
        let column = 0
        for (const cell of row.cells) {
          // A full-width cell (empty or loading state) needs no label.
          const label = cell.colSpan > 1 && cell.colSpan >= headers.length ? '' : labelOf(headers[column])
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
          column += cell.colSpan || 1
        }
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(table, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [tableRef])
}
