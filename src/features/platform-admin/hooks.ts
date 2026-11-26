import { useQuery } from '@tanstack/react-query'
import { fetchIsPlatformAdmin, fetchPlatformOverview } from './api'

export const PLATFORM_ADMIN = 'platform-admin'

/**
 * فحص نوع المستخدم الحالي (أدمن منصة أم لا) — تستخدمه بوابة الحراسة.
 * حتى تطبيق 0055 يفشل الاستعلام (الدالة غائبة) فيبقى isError ظاهراً
 * للبوابة فتعرض الرفض — تدهور معلن ومقصود: لا دخول بلا إثبات.
 */
export function useIsPlatformAdmin(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'is-admin'],
    enabled,
    queryFn: fetchIsPlatformAdmin,
  })
}

/** أرقام المنصة التجميعية — تُفعَّل بعد ثبوت صفة الأدمن فقط */
export function usePlatformOverview(enabled: boolean) {
  return useQuery({
    queryKey: [PLATFORM_ADMIN, 'overview'],
    enabled,
    queryFn: fetchPlatformOverview,
  })
}
