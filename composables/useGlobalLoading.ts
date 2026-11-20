import { computed, ref } from 'vue'

/**
 * Global activity indicator shared by the whole app (one instance per browser
 * tab): route changes and API calls call `start()` / `end()`, the LoadingBar
 * component renders the state. Short operations still show the bar for a
 * minimum time so that the feedback is perceptible.
 */
const MIN_VISIBLE_MS = 400
const HIDE_AFTER_MS = 350

const pending = ref(0)
const visible = ref(false)
const progress = ref(0)

let startedAt = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null
let minTimer: ReturnType<typeof setTimeout> | null = null
let ticker: ReturnType<typeof setInterval> | null = null

const isClient = () => typeof window !== 'undefined'

const clearTimers = () => {
  if (hideTimer) clearTimeout(hideTimer)
  if (minTimer) clearTimeout(minTimer)
  if (ticker) clearInterval(ticker)
  hideTimer = minTimer = ticker = null
}

const show = () => {
  if (!isClient()) return
  clearTimers()
  startedAt = Date.now()
  visible.value = true
  progress.value = 12
  // creep towards 85 % while the operation lasts
  ticker = setInterval(() => {
    if (progress.value < 85) progress.value += (85 - progress.value) * 0.08
  }, 120)
}

const hide = () => {
  if (!isClient()) return
  const elapsed = Date.now() - startedAt
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)
  if (minTimer) clearTimeout(minTimer)
  minTimer = setTimeout(() => {
    if (pending.value > 0) return // a new operation started meanwhile
    if (ticker) clearInterval(ticker)
    ticker = null
    progress.value = 100
    hideTimer = setTimeout(() => {
      if (pending.value > 0) return
      visible.value = false
      progress.value = 0
    }, HIDE_AFTER_MS)
  }, wait)
}

export function useGlobalLoading() {
  const start = () => {
    pending.value += 1
    if (pending.value === 1) show()
  }
  const end = () => {
    pending.value = Math.max(0, pending.value - 1)
    if (pending.value === 0) hide()
  }
  /** Run an async function with the indicator shown while it lasts. */
  const track = async <T>(fn: () => Promise<T>): Promise<T> => {
    start()
    try {
      return await fn()
    } finally {
      end()
    }
  }
  return {
    pending: computed(() => pending.value),
    visible: computed(() => visible.value),
    progress: computed(() => progress.value),
    start,
    end,
    track
  }
}
