import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { EMPTY_BRAND, resolveBrand, type BrandIdentity } from '../lib/brand'
import { fetchTeacherSettings } from '../features/auth/api'

/**
 * هوية المدرس البيضاء لأسطح العرض داخل التطبيق (كارت الطالب، الإيصال،
 * ورقة الامتحان): صف إعداداته (brand_*) + اسمه من teachers، تُحلّ بـ
 * resolveBrand — أي غياب/خطأ يسقط للافتراضي بلا كسر (EMPTY_BRAND ثم
 * اسم المدرس إن وُجد). مفتاح الكاش مستقل حتى لا نكسر عقود وحدة
 * الإعدادات، وحفظ الإعدادات/الشعار يبطل ['brand-identity'] معها.
 */
export function useBrandIdentity(teacherId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['brand-identity', teacherId],
    enabled: Boolean(teacherId) && enabled && Boolean(supabase),
    queryFn: async (): Promise<BrandIdentity> => {
      const [settings, teacherRes] = await Promise.all([
        fetchTeacherSettings(teacherId!).catch(() => null),
        supabase!
          .from('teachers')
          .select('display_name')
          .eq('id', teacherId!)
          .maybeSingle(),
      ])
      const teacherName =
        (teacherRes.data as unknown as { display_name?: string } | null)?.display_name ?? null
      return resolveBrand({
        brandName: settings?.brand_name,
        teacherName,
        logoPath: settings?.brand_logo_path,
        accent: settings?.brand_accent,
      })
    },
  })
  return { brand: query.data ?? EMPTY_BRAND, isPending: query.isPending }
}
