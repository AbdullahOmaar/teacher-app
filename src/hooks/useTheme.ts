import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'teacher-app-theme'

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveDark(mode) ? 'dark' : 'light'
}

/** إدارة ثيم التطبيق: تلقائي/فاتح/داكن — يُحفظ الاختيار محلياً (كما في المرجع §6.7). */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
  })

  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next)
    setModeState(next)
  }, [])

  /** تبديل سريع فاتح/داكن من الشريط العلوي (يتجاوز التلقائي كما في المرجع). */
  const toggle = useCallback(() => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    setMode(isDark ? 'light' : 'dark')
  }, [setMode])

  return { mode, setMode, toggle }
}
