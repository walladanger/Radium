import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../i18n'
import { WorkspaceWindow } from './WorkspaceWindow'

class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[radium-workspace]', error, info.componentStack) }
  render() {
    if (this.state.error) return <div role="alert" className="p-8 text-sm">
      <h1 className="font-semibold">Workspace could not open</h1>
      <p>{this.state.error}</p>
      <button className="mt-3 underline" onClick={() => window.location.reload()}>Reload workspace</button>
    </div>
    return this.props.children
  }
}
createRoot(document.getElementById('root')!).render(
  <WorkspaceErrorBoundary><WorkspaceWindow /></WorkspaceErrorBoundary>
)
