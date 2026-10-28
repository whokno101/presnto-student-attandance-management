import * as React from 'react'

/**
 * Tiny toast store shared by the whole app.
 *
 * Uses `useSyncExternalStore` instead of a useEffect subscription so a toast
 * dispatched *before* <Toaster> mounts (for example the "session expired"
 * notice fired during the first render of the login page) is never lost.
 */
const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 300

let count = 0
const genId = () => {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

let memoryState = { toasts: [] }
const listeners = new Set()
const timeouts = new Map()

const emit = () => {
  listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => memoryState

const addToRemoveQueue = (toastId) => {
  if (timeouts.has(toastId)) return

  const timeout = setTimeout(() => {
    timeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)

  timeouts.set(toastId, timeout)
}

const reducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      }

    case 'DISMISS_TOAST': {
      const { toastId } = action
      if (toastId) addToRemoveQueue(toastId)
      else state.toasts.forEach((t) => addToRemoveQueue(t.id))

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      }
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }

    default:
      return state
  }
}

const dispatch = (action) => {
  memoryState = reducer(memoryState, action)
  emit()
}

function toast({ ...props }) {
  const id = genId()

  const update = (next) => dispatch({ type: 'UPDATE_TOAST', toast: { ...next, id } })
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return { id, dismiss, update }
}

function useToast() {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
