// Where a scanned model came from: the label and pill colours per source.
// Kept apart from ModelSourceBadge so that file exports only components.

// `Model` is a global ambient type (see web-app/src/types/modelProviders.d.ts).
type ModelSource = NonNullable<Model['source']>

export const SOURCE_META: Record<
  ModelSource,
  { label: string; className: string }
> = {
  ollama: {
    label: 'Ollama',
    className:
      'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200',
  },
  lmstudio: {
    label: 'LM Studio',
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-200',
  },
  unsloth: {
    label: 'Unsloth',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200',
  },
  // Was mislabelled "Unsloth": anything found in `~/.cache/huggingface/hub`
  // wore another app's name, on the badge and in the missing-file message.
  'huggingface-cache': {
    label: 'Hugging Face',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200',
  },
  gpt4all: {
    label: 'GPT4All',
    className:
      'border-lime-200 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-950/45 dark:text-lime-200',
  },
  jan: {
    label: 'Jan',
    className:
      'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/45 dark:text-cyan-200',
  },
  msty: {
    label: 'Msty',
    className:
      'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/45 dark:text-fuchsia-200',
  },
  'llamacpp-cache': {
    label: 'llama.cpp',
    className:
      'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/45 dark:text-orange-200',
  },
  local: {
    label: 'Local',
    className:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200',
  },
}

/** The name of the app a scanned model came from, for copy outside the pill. */
export function modelSourceLabel(source?: Model['source']): string | undefined {
  return source ? SOURCE_META[source]?.label : undefined
}
