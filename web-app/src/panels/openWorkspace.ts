let opening: Promise<void> | undefined

/** Focus the singleton workspace or await native creation, without starting a second chat runtime. */
export function openPanelWorkspace(): Promise<void> {
  if (opening) return opening
  opening = (async () => {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel('radium-workspace')
    if (existing) {
      await existing.show()
      await existing.unminimize()
      await existing.setFocus()
      return
    }
    const workspace = new WebviewWindow('radium-workspace', {
      url: '/workspace.html', title: 'Radium Workspace',
      width: 1280, height: 840, minWidth: 640, minHeight: 480,
      resizable: true, center: true, decorations: true,
    })
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const unlisten: (() => void)[] = []
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        unlisten.splice(0).forEach((stop) => stop())
        if (error) reject(new Error(String(error)))
        else resolve()
      }
      const timeout = setTimeout(() => finish('Workspace window creation timed out'), 15000)
      for (const event of ['tauri:created', 'tauri:error']) {
        workspace.once(event, (message) => finish(event === 'tauri:error' ? message.payload : undefined))
          .then((stop) => settled ? stop() : unlisten.push(stop))
          .catch(finish)
      }
    })
  })().finally(() => { opening = undefined })
  return opening
}
