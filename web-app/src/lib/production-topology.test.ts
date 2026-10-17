import { expect, it } from 'vitest'
import { productionTopology } from './production-topology'
import type { ControlTask } from './atomic-control'

const task = (id: string, title: string, dependencies: string[] = []): ControlTask => ({
  id, title, dependencies, plan_id: 'plan', description: '', role: 'edit',
  write_scopes: [], revision: 1, status: 'ready', created_at: 0,
})

it('keeps all prerequisites and uses generated graph identifiers', () => {
  const graph = productionTopology([task('backend', 'Backend'), task('ui', 'UI'), task('join', 'Check combined result', ['backend', 'ui'])])
  expect(graph).toContain('task0 --> task2')
  expect(graph).toContain('task1 --> task2')
  expect(graph).not.toContain('merge')
})

it('prevents titles and identifiers from injecting graph statements', () => {
  const graph = productionTopology([task('x --> injected', '"]\nclick task0 "https://evil.test"')])
  expect(graph.split('\n')).toHaveLength(2)
  expect(graph).not.toContain('https://evil.test')
  expect(graph).not.toContain('x --> injected')
  expect(graph).toContain('#34;')
})
