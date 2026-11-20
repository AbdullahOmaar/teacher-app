import { useSyncExternalStore } from 'react'

/**
 * التقاط حدث تثبيت الـ PWA (beforeinstallprompt) مبكراً (خطوة 11):
 * المتصفح يطلقه مرة واحدة مبكراً في عمر الصفحة، فنسجّله على مستوى
 * الوحدة (يُستورد من main.tsx) ونحتفظ به حتى يطلبه المستخدم من بطاقة
 * «تثبيت التطبيق» في الإعدادات — نمط غير مزعج: لا نوافذ منبثقة أبداً،
 * التثبيت يبدأ فقط بضغطة صريحة من الإعدادات.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // نمنع بانر المتصفح الافتراضي — التثبيت عندنا من الإعدادات فقط
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export interface InstallState {
  /** حدث تثبيت جاهز للاستدعاء (Chrome/Edge/Android) */
  canPrompt: boolean
  /** التطبيق يعمل مثبّتاً أصلاً أو ثُبّت في هذه الجلسة */
  isInstalled: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

function getSnapshot(): string {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true)
  return `${deferred ? 'prompt' : 'none'}|${installed || standalone ? 'installed' : 'browser'}`
}

export function useInstallPrompt(): InstallState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => 'none|browser')
  const [kind, mode] = snap.split('|')
  return {
    canPrompt: kind === 'prompt',
    isInstalled: mode === 'installed',
    promptInstall: async () => {
      if (!deferred) return 'unavailable'
      const ev = deferred
      deferred = null
      emit()
      await ev.prompt()
      const choice = await ev.userChoice
      return choice.outcome
    },
  }
}
