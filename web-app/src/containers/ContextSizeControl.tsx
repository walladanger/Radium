import { type ThreadMessage } from '@janhq/core'
import { useRef, useState } from 'react'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  formatContextSize,
  useModelContextLength,
} from '@/hooks/useModelContextLength'
import { useTokensCount } from '@/hooks/useTokensCount'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { cn } from '@/lib/utils'
import { useAgentRun } from '@/hooks/useAgentRun'
import { useThreads } from '@/hooks/useThreads'
import { readContextUsage } from '@/lib/context-usage'

interface ContextSizeControlProps {
  placement?: 'header' | 'composer'
  messages?: ThreadMessage[]
  additionalTokens?: number
  uploadedFiles?: Array<{
    name: string
    type: string
    size: number
    base64: string
    dataUrl: string
  }>
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

type LatestTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function getLatestTokenUsage(messages: ThreadMessage[]): LatestTokenUsage {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue

    const metadata = message.metadata as Record<string, unknown> | undefined
    const usage = metadata?.usage as
      | {
          inputTokens?: unknown
          outputTokens?: unknown
          totalTokens?: unknown
        }
      | undefined
    const tokenSpeed = metadata?.tokenSpeed as
      | { tokenCount?: unknown }
      | undefined
    const outputValue = usage?.outputTokens ?? tokenSpeed?.tokenCount
    const outputTokens =
      typeof outputValue === 'number' && Number.isFinite(outputValue)
        ? Math.max(0, outputValue)
        : 0
    const totalTokens =
      typeof usage?.totalTokens === 'number' &&
      Number.isFinite(usage.totalTokens)
        ? Math.max(0, usage.totalTokens)
        : 0
    const inputTokens =
      typeof usage?.inputTokens === 'number' &&
      Number.isFinite(usage.inputTokens)
        ? Math.max(0, usage.inputTokens)
        : Math.max(0, totalTokens - outputTokens)

    return {
      inputTokens,
      outputTokens,
      totalTokens: Math.max(totalTokens, inputTokens + outputTokens),
    }
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

export function ContextSizeControl({
  placement = 'header',
  messages = [],
  additionalTokens = 0,
  uploadedFiles = [],
}: ContextSizeControlProps) {
  const tokenData = useTokensCount(messages, uploadedFiles)
  const latestUsage = getLatestTokenUsage(messages)
  const threadId = useThreads(state => state.currentThreadId)
  const liveContext = useAgentRun(state => threadId ? state.runs[threadId]?.contextUsage : undefined)
  const latestMessage = [...messages].reverse().find(item => item.role === 'assistant')
  const savedContext = readContextUsage((latestMessage?.metadata as { contextUsage?: unknown } | undefined)?.contextUsage)
  const validLiveContext = readContextUsage(liveContext)
  const context = validLiveContext && (!savedContext || validLiveContext.updatedAt >= savedContext.updatedAt) ? validLiveContext : savedContext
  const contextTotal = context ? Object.values(context.categories).reduce((sum, count) => sum + count, 0) : 0
  const trigger = useRef<HTMLButtonElement>(null)
  const [popupSide, setPopupSide] = useState<'right' | 'top'>('top')
  const measuredTokens = tokenData.tokenCount + additionalTokens
  const totalTokens = contextTotal > 0 ? contextTotal :
    measuredTokens > 0
      ? measuredTokens
      : latestUsage.totalTokens + additionalTokens
  const completionTokens = Math.min(totalTokens, context ? (context.categories.completion ?? 0) : latestUsage.outputTokens)
  const promptTokens = Math.max(0, totalTokens - completionTokens)
  const maxTokens = context?.contextWindow || tokenData.maxTokens
  const percentage = maxTokens
    ? (totalTokens / maxTokens) * 100
    : 0
  const isOverLimit = percentage > 100
  const progressTone =
    percentage >= 90
      ? 'bg-destructive'
      : percentage >= 70
        ? 'bg-orange-500'
        : 'bg-emerald-500'
  const {
    available,
    contextSetting,
    draft: draftContext,
    setDraft: setDraftContext,
    commit: handleContextChange,
    sliderMin,
    sliderMax,
    sliderStep,
    fitAvailable,
    fitEnabled,
    setFit,
  } = useModelContextLength()
  const { t } = useTranslation()

  if (!context && (!available || !contextSetting)) return null

  const percentageLabel = maxTokens ? `${percentage.toFixed(1)}%` : 'Context'

  return (
    <Popover onOpenChange={open => { if (open) setPopupSide(window.innerWidth - (trigger.current?.getBoundingClientRect().right ?? window.innerWidth) >= 352 ? 'right' : 'top') }}>
      <PopoverTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-2 px-2 font-mono text-xs"
          aria-label={`Context usage: ${percentageLabel}`}
        >
          <span className={cn(isOverLimit && 'text-destructive')}>
            {percentageLabel}
          </span>
          <span className="relative size-4 shrink-0">
            <svg className="size-4 -rotate-90" viewBox="0 0 16 16">
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                className="text-muted-foreground"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 6}`}
                strokeDashoffset={`${2 * Math.PI * 6 * (1 - Math.min(percentage, 100) / 100)}`}
                className={cn(
                  'transition-all duration-500 ease-out',
                  isOverLimit ? 'stroke-destructive' : 'stroke-primary'
                )}
                style={{ transformOrigin: 'center' }}
              />
            </svg>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side={placement === 'composer' ? popupSide : 'bottom'} sideOffset={16} collisionPadding={16} className="dark max-h-[min(75dvh,48rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto space-y-3 rounded-xl border-white/15 bg-black/85 p-4 text-foreground shadow-xl backdrop-blur-xl">
        <div className="space-y-1"><h3 className="font-medium">Context window</h3><p className="truncate text-xs text-muted-foreground">{context?.estimated ? 'Estimated prompt composition' : 'Prompt and generation usage'}</p></div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span
              className={cn(
                'text-lg font-semibold tabular-nums',
                isOverLimit ? 'text-destructive' : 'text-primary'
              )}
            >
              {percentageLabel}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatTokenCount(totalTokens)} /{' '}
              {maxTokens ? formatTokenCount(maxTokens) : 'capacity unknown'}
            </span>
          </div>
          {!!maxTokens && <Progress
            aria-label="Context usage"
            value={Math.min(percentage, 100)}
            className="h-1.5 bg-muted"
            indicatorClassName={progressTone}
          />}
        </div>
        <div className="space-y-2 border-t pt-3" aria-label="Context breakdown">
          {([
            ['messages', 'Messages'], ['mcpTools', 'MCP tools'], ['systemTools', 'System tools'],
            ['systemPrompt', 'System prompt'], ['mcpServerInstructions', 'MCP server instructions'],
            ['skills', 'Skills'], ['memoryFiles', 'Memory files'], ['customAgents', 'Custom agents'],
            ['documents', 'Documents'], ['autoCompactBuffer', 'Autocompact buffer'],
            ['deferredMcpTools', 'MCP tools (deferred)'], ['deferredSystemTools', 'System tools (deferred)'],
          ] as const).map(([key, label]) => {
            const value = context?.categories[key]
            return <div key={key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums">{value === undefined ? <span title="This engine does not report a separate count for this category.">Not reported</span> : <>≈ {formatTokenCount(value)} <span className="text-muted-foreground">{maxTokens ? `${(value / maxTokens * 100).toFixed(1)}%` : ''}</span></>}</span>
            </div>
          })}
          <p className="text-xs text-muted-foreground">{context ? <>Updated <time dateTime={new Date(context.updatedAt).toISOString()}>{new Date(context.updatedAt).toLocaleTimeString()}</time>. Counts describe the last request; send a message to refresh.</> : 'Send a message to measure the prompt composition. Unavailable counts are not treated as zero.'}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <IconArrowUp className="size-3.5" stroke={1.75} />
              <span>Input</span>
            </span>
            <span className="font-mono text-foreground">
              {formatTokenCount(promptTokens)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <IconArrowDown className="size-3.5" stroke={1.75} />
              <span>Output</span>
            </span>
            <span className="font-mono text-foreground">
              {formatTokenCount(completionTokens)}
            </span>
          </div>
        </div>
        {available && contextSetting && <div className="space-y-3 border-t border-border pt-3">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium">{contextSetting.title}</div>
              <div className="font-mono text-xs tabular-nums">
                {formatContextSize(draftContext)}
              </div>
            </div>
            {contextSetting.description && !fitEnabled && (
              <div className="text-xs text-muted-foreground">
                {contextSetting.description}
              </div>
            )}
          </div>
          {fitAvailable && (
            <label className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="block font-medium">
                  {t('assistants:contextSizeFit')}
                </span>
                <span className="block text-muted-foreground">
                  {fitEnabled
                    ? t('assistants:contextSizeFitOn')
                    : t('assistants:contextSizeFitHint')}
                </span>
              </span>
              <Switch
                aria-label={t('assistants:contextSizeFit')}
                checked={fitEnabled}
                onCheckedChange={setFit}
              />
            </label>
          )}
          {/* Under fit the slider is not ignored silently, as it was: it is
              disabled, and the number above it is the one the engine chose. */}
          <Slider
            aria-label={contextSetting.title}
            className="w-full"
            disabled={fitEnabled}
            value={[Math.min(Math.max(draftContext, sliderMin), sliderMax)]}
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            onValueChange={([value]) => setDraftContext(value)}
            onValueCommit={([value]) => handleContextChange(value)}
          />
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{formatContextSize(sliderMin)}</span>
            <span>{formatContextSize(sliderMax)}</span>
          </div>
        </div>}
      </PopoverContent>
    </Popover>
  )
}
