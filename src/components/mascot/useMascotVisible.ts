import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTeacherSettings } from '../../features/auth/api'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'

/**
 * مفتاح مرآة التفضيل في التخزين المحلي — يقرؤه سكربت إقلاع index.html
 * قبل أول رسم ليختار لوجو السبلاش (دُفّي أو الكتاب) بلا وميض، وتقرؤه
 * نقاط الظهور التي تعمل قبل حلّ هوية المدرس/إعداداته (شاشة فحص الجلسة).
 */
export const MASCOT_MIRROR_KEY = 'teacher-app-show-mascot'

export function readMascotMirror(): boolean | null {
  try {
    const v = localStorage.getItem(MASCOT_MIRROR_KEY)
    if (v === '0') return false
    if (v === '1') return true
    return null
  } catch {
    // بلا وصول للتخزين (وضع خاص/متصفح مقيد): لا مرآة — الافتراضي يقرر
    return null
  }
}

function writeMascotMirror(show: boolean) {
  try {
    localStorage.setItem(MASCOT_MIRROR_KEY, show ? '1' : '0')
  } catch {
    // التخزين غير متاح: المرآة رفاهية إقلاع فقط، تجاهل آمن
  }
}

/**
 * هل يظهر دُفّي؟ (MASCOT-PLAN §٦ — بند ٥)
 *
 * مصدر الحقيقة: teacher_settings.show_mascot للسنتر النشط (0028)،
 * يُقرأ بنفس مفتاح كاش الإعدادات (['settings','teacher-settings',id] —
 * انظر SETTINGS في features/settings/hooks) حتى تنعكس كتابة بطاقة
 * الإعدادات هنا فوراً. الإعدادات بسياسة المالك فقط، فتُفعَّل القراءة
 * للمالك وحده؛ وللمساعد/قبل الحلّ/في الأسطح العامة يسقط القرار لمرآة
 * التخزين المحلي ثم للافتراضي «يظهر» — أي أن إيقاف المالك يصمد عبر
 * الإقلاع (المرآة) بينما لا يُحجَب دُفّي عن مساعد لمجرّد تعذّر قراءة
 * صفّ لا يملك صلاحيته أصلاً.
 */
export function useMascotVisible(): boolean {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const settingsQ = useQuery({
    queryKey: ['settings', 'teacher-settings', teacherId],
    enabled: Boolean(teacherId) && isOwner,
    queryFn: () => fetchTeacherSettings(teacherId!),
    staleTime: 30_000,
  })

  const rowValue = settingsQ.data?.show_mascot

  useEffect(() => {
    if (typeof rowValue === 'boolean') writeMascotMirror(rowValue)
  }, [rowValue])

  if (typeof rowValue === 'boolean') return rowValue
  return readMascotMirror() ?? true
}

/** احترام تفضيل تقليل الحركة في النظام — أنيميشن دُفّي تسقط للثابت */
export function usePrefersReducedMotion(): boolean {
  // القراءة متزامنة عند أول تصيير (matchMedia متاح في كل متصفحات الهدف)
  // والتغيّر أثناء الجلسة نادر ولا يستحق اشتراكاً حياً هنا.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
