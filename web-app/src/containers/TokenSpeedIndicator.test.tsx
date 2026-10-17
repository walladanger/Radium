import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TokenSpeedIndicator from '@/containers/TokenSpeedIndicator'
import { useAppState } from '@/hooks/useAppState'

describe('TokenSpeedIndicator', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('shows growing live metrics and switches to final reported usage', () => {
    vi.useFakeTimers()
    const view = render(<TokenSpeedIndicator messageId="live" streaming streamingText="hello" />)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText(/^≈ .* tok\/sec$/)).toBeInTheDocument()
    const initial = screen.getByText(/≈ .* tokens/).textContent
    view.rerender(<TokenSpeedIndicator messageId="live" streaming streamingText="hello world and more generated words" />)
    expect(screen.getByText(/≈ .* tokens/).textContent).not.toBe(initial)
    view.rerender(<TokenSpeedIndicator messageId="live" streaming={false} metadata={{ usage: { outputTokens: 12 }, tokenSpeed: { tokenSpeed: 24 } }} />)
    expect(screen.getByText('12 tokens')).toBeInTheDocument()
    expect(screen.getByText('24 tok/sec')).toBeInTheDocument()
    expect(screen.queryByText(/Peak/)).not.toBeInTheDocument()
  })
  beforeEach(() => {
    useAppState.setState({ tokenSpeed: undefined })
  })

  it('keeps the output-token count visible when TPS is unavailable', () => {
    render(
      <TokenSpeedIndicator
        metadata={{ usage: { inputTokens: 631, outputTokens: 1_116 } }}
      />
    )

    expect(screen.getByText('1116 tokens')).toBeInTheDocument()
    expect(screen.queryByText(/tok\/sec/)).not.toBeInTheDocument()
  })

  it('shows both metrics when a reliable TPS value exists', () => {
    render(
      <TokenSpeedIndicator
        metadata={{
          usage: { inputTokens: 631, outputTokens: 594 },
          tokenSpeed: { tokenSpeed: 54.1, tokenCount: 594 },
        }}
      />
    )

    expect(screen.getByText('54 tok/sec')).toBeInTheDocument()
    expect(screen.getByText('594 tokens')).toBeInTheDocument()
  })
})
