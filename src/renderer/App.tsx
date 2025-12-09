/**
 * Main Application Component
 * Clean, professional layout with subtle ambient background
 */
import { useEffect } from 'react'
import { useAppStore } from '@stores/appStore'
import { useServerAPI, useFileAPI } from '@hooks/useElectronAPI'
import { TitleBar } from './components/TitleBar'
import { TabBar } from './components/TabBar'
import { Editor } from './components/Editor'
import { StatusBar } from './components/StatusBar'
import { ShareModal } from './components/ShareModal'

export function App() {
  const { createTab, tabs } = useAppStore()
  const { saveProject } = useFileAPI()

  // Initialize server listeners
  useServerAPI()

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes('Mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey) {
        switch (e.key.toLowerCase()) {
          case 't':
            e.preventDefault()
            createTab()
            break
          case 's':
            e.preventDefault()
            saveProject()
            break
          case 'o':
            e.preventDefault()
            window.electronAPI.file.openDialog()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createTab, saveProject])

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-bg-base">
      {/* Subtle ambient gradient - refined, not distracting */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* Top-right glow */}
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{
            background: 'radial-gradient(circle, #2dd4bf 0%, transparent 70%)'
          }}
        />
        {/* Bottom-left glow */}
        <div
          className="absolute -bottom-48 -left-48 w-[600px] h-[600px] rounded-full opacity-[0.02]"
          style={{
            background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)'
          }}
        />
        {/* Very subtle noise texture */}
        <div className="absolute inset-0 noise-overlay" />
      </div>

      {/* Main application layout */}
      <div className="relative z-10 h-full w-full flex flex-col">
        <TitleBar />
        <TabBar />
        <Editor />
        <StatusBar />
      </div>

      {/* Share Modal */}
      <ShareModal />
    </div>
  )
}
