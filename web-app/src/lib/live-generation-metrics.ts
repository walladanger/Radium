import { estimateTokens } from '@/lib/prompt-size'

/** Stream chunks are not tokens. Until usage arrives, label these as estimates. */
export class LiveGenerationMeter {
  private startedAt?: number
  private tokens = 0
  private peak = 0

  sample(text: string, now: number) {
    if (text && this.startedAt === undefined) this.startedAt = now
    this.tokens = Math.max(this.tokens, estimateTokens(text))
    const seconds = this.startedAt === undefined ? 0 : (now - this.startedAt) / 1000
    const speed = seconds >= 0.25 ? this.tokens / seconds : 0
    this.peak = Math.max(this.peak, speed)
    return { tokenCount: this.tokens, tokenSpeed: speed, peak: this.peak }
  }
}
