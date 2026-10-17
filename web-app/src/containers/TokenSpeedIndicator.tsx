import { memo, useEffect, useState } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { toNumber } from '@/utils/number'
import { Gauge, WholeWord } from 'lucide-react'
import { LiveGenerationMeter } from '@/lib/live-generation-metrics'

interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

interface TokenSpeed {
  tokenSpeed: number
  tokenCount?: number
  durationMs?: number
  // Speculative decoding stats (llama.cpp draft model: n_drafted / n_accepted).
  draftTokensTotal?: number
  draftTokensAccepted?: number
}

interface TokenSpeedIndicatorProps {
  metadata?: Record<string, unknown>
  streaming?: boolean
  messageId?: string
  streamingText?: string
}

export const TokenSpeedIndicator = memo(
  ({ metadata, streaming, messageId, streamingText = '' }: TokenSpeedIndicatorProps) => {
    const [live, setLive] = useState({ tokenCount: 0, tokenSpeed: 0, peak: 0 })
    const [meter, setMeter] = useState(() => new LiveGenerationMeter())
    useEffect(() => { setMeter(new LiveGenerationMeter()); setLive({ tokenCount: 0, tokenSpeed: 0, peak: 0 }) }, [messageId, streaming])
    useEffect(() => {
      if (!streaming) return
      const update = () => setLive(meter.sample(streamingText, Date.now()))
      update()
      const timer = window.setInterval(update, 250)
      return () => window.clearInterval(timer)
    }, [streaming, streamingText, meter])
    const hasLiveUsage = useAppState(state => !!messageId && state.tokenSpeed?.message === messageId)
    // Get real-time token speed from global state during streaming
    const streamingTokenSpeed = useAppState((state) =>
      state.tokenSpeed ? Math.round(state.tokenSpeed.tokenSpeed) : 0
    )
    const streamingTokenCount = useAppState((state) =>
      state.tokenSpeed?.tokenCount || 0
    )

    // Fallback to persisted metadata when not streaming
    const persistedTokenSpeed =
      (metadata?.tokenSpeed as TokenSpeed)?.tokenSpeed || 0
    const persistedTokenCount =
      (metadata?.tokenSpeed as TokenSpeed)?.tokenCount || 0
    const usage = metadata?.usage as TokenUsage | undefined

    const nonStreamingAssistantParam =
      typeof metadata?.assistant === 'object' &&
      metadata?.assistant !== null &&
      'parameters' in metadata.assistant
        ? (metadata.assistant as { parameters?: { stream?: boolean } })
            .parameters?.stream === false
        : undefined

    if (nonStreamingAssistantParam) return

    // Use streaming data if available, otherwise fall back to metadata
    const displaySpeed = streaming
      ? (hasLiveUsage ? streamingTokenSpeed : Math.round(live.tokenSpeed))
      : Math.round(toNumber(persistedTokenSpeed))

    const displayTokenCount = streaming
      ? (hasLiveUsage ? streamingTokenCount : live.tokenCount)
      : (usage?.outputTokens ?? persistedTokenCount)

    // Show indicator during streaming OR when we have persisted data
    const shouldShow = streaming || displaySpeed > 0 || displayTokenCount > 0

    if (!shouldShow) return

    // Speculative-decoding acceptance rate = accepted / total drafted tokens.
    const spec = metadata?.tokenSpeed as TokenSpeed | undefined
    const draftTotal = spec?.draftTokensTotal ?? 0
    const draftAccepted = spec?.draftTokensAccepted ?? 0
    const acceptanceRate =
      draftTotal > 0 ? (draftAccepted / draftTotal) * 100 : null

    return (
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs tabular-nums" aria-label="Generation metrics" title={streaming && !hasLiveUsage ? 'Estimated from generated text until the model reports its token usage.' : undefined}>
        {(streaming || displaySpeed > 0) && (
          <div className="flex items-center gap-1">
            <Gauge size={16} />
            <span>{streaming && !hasLiveUsage ? '≈ ' : ''}{displaySpeed} tok/sec</span>
          </div>
        )}
        {(streaming || displayTokenCount > 0) && (
          <div className="flex items-center gap-1">
            <WholeWord size={16} />
            <span>{streaming && !hasLiveUsage ? '≈ ' : ''}{displayTokenCount} tokens</span>
          </div>
        )}
        {streaming && live.peak > 0 && !hasLiveUsage && <span>Peak ≈ {Math.round(live.peak)} tok/sec</span>}
        {acceptanceRate !== null && (
          <span>{acceptanceRate.toFixed(1)}% draft tokens accepted</span>
        )}
      </div>
    )
  }
)

export default memo(TokenSpeedIndicator)
