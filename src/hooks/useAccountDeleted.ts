import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

/**
 * كشف الحذف الناعم للحساب الحالي (مهاجرة 0075 — F1 من اختبار سند).
 *
 * لماذا خطاف مستقل لا حالة جديدة في useCurrentTeacher؟ إضافة حالة
 * لاتحاد TeacherResolution تكسر تضييق الأنواع في كل صفحة (تخرج بعد
 * الحالات الثلاث القائمة) — بينما المستهلك الوحيد لهذه المعلومة هو
 * القشرة (AppShell) التي تعرض شاشة الحذف المصممة بدل المحتوى كله.
 *
 * القراءة متسامحة (قاعدة بوابة التجميد): قبل تطبيق 0075 يرفض
 * PostgREST العمود بـ PGRST204 — نعتبرها «غير محذوف» (الحالة الحية
 * اليوم) فلا يتغيّر أي سلوك، وبعد التطبيق تُقرأ القيمة الحقيقية.
 * سياسة teachers_self_select تسمح للمالك بقراءة صفّه حتى بعد الحذف
 * الناعم (الحذف يغلق التحديث والبيانات، لا قراءة الصف نفسه) — وهذا
 * مقصود حتى تعمل هذه الشاشة.
 *
 * يرجع طابع deleted_at أو null (حي/غير منطبق/جارٍ التحميل).
 */
export function useAccountDeletedAt(): string | null {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['account-deleted-at', user?.id ?? null],
    enabled: Boolean(supabase && user),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase!
        .from('teachers')
        .select('deleted_at')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) {
        // 0075 غير مطبّقة بعد (PGRST204) أو أي فشل قراءة: لا حجب —
        // الحارس الحقيقي خادمي (حظر الدخول + قطع الجلسات في المهاجرة).
        return null
      }
      return data?.deleted_at ?? null
    },
  })
  return query.data ?? null
}
