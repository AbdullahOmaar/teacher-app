import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'teacher-app-active-teacher'
const EVENT = 'teacher-workspace-changed'

/**
 * مساحة العمل النشطة: معرّف المدرس الذي يعمل المستخدم تحت حسابه الآن.
 * الافتراضي null = حساب المستخدم نفسه (المدرس المالك). عند اختيار عضوية
 * فريق (مساعد عند مدرس آخر) يُحفظ teacher_id الخاص بذلك المدرس هنا،
 * وكل الهوكس تقرأ البيانات بهذا المعرّف — فتعمل وحدتا الطلاب والمجموعات
 * في الحالتين دون أي تغيير.
 */
export function getActiveTeacherId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setActiveTeacherId(teacherId: string | null) {
  try {
    if (teacherId) localStorage.setItem(STORAGE_KEY, teacherId)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // تجاهل: التخزين المحلي غير متاح
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** قراءة تفاعلية لمساحة العمل النشطة (تتحدث فوراً عند التبديل) */
export function useActiveTeacherId(): string | null {
  return useSyncExternalStore(subscribe, getActiveTeacherId, () => null)
}
