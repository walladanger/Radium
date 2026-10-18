import type { ControlTask } from './atomic-control'

// Use generated identifiers and entity-escaped labels: task text is never syntax.
const label = (value: string) => value.replace(/[^a-zA-Z0-9 ._-]/g,
  character => `#${character.codePointAt(0)};`).replace(/[\r\n]/g, ' ')

/** Dependencies describe prerequisites, never Git branches or merges. */
export function productionTopology(tasks: ControlTask[]): string {
  const ids = new Map(tasks.map((task, index) => [task.id, `task${index}`]))
  const source = ['flowchart TD']
  for (const task of tasks) {
    source.push(`  ${ids.get(task.id)}["${label(task.title)} · ${label(task.status)}"]`)
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      const predecessor = ids.get(dependency)
      if (predecessor) source.push(`  ${predecessor} --> ${ids.get(task.id)}`)
    }
  }
  return source.join('\n')
}
