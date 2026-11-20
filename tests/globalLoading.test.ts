// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalLoading } from '../composables/useGlobalLoading'

describe('useGlobalLoading', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the bar for at least the minimum time, even for instant operations', async () => {
    const bar = useGlobalLoading()
    bar.start()
    expect(bar.visible.value).toBe(true)
    expect(bar.progress.value).toBeGreaterThan(0)
    bar.end()
    vi.advanceTimersByTime(200)
    expect(bar.visible.value).toBe(true) // still within the minimum visible time
    vi.advanceTimersByTime(300)
    expect(bar.progress.value).toBe(100)
    vi.advanceTimersByTime(400)
    expect(bar.visible.value).toBe(false)
    expect(bar.progress.value).toBe(0)
  })

  it('stays visible while several operations overlap', async () => {
    const bar = useGlobalLoading()
    bar.start()
    bar.start()
    bar.end()
    vi.advanceTimersByTime(1000)
    expect(bar.visible.value).toBe(true)
    expect(bar.pending.value).toBe(1)
    bar.end()
    vi.advanceTimersByTime(1000)
    expect(bar.visible.value).toBe(false)
  })

  it('track() wraps an async function', async () => {
    const bar = useGlobalLoading()
    const result = await bar.track(async () => 42)
    expect(result).toBe(42)
    expect(bar.pending.value).toBe(0)
  })
})
