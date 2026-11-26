import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { normalizePrintFont, type PrintFontKey } from '../lib/printFonts'

/**
 * خط طباعة مستندات المدرس (مهمة 12 — ج16-1 / مهاجرة 0054): يقرأ
 * print_font من صف إعداداته ويُطبّعها — أي غياب/خطأ/قيمة مكسورة تسقط
 * للافتراضي (null) بلا كسر لأي سطح طباعة. قبل تطبيق 0054 عند بوابة
 * التجميد يرجع الاستعلام بخطأ عمود غائب فتسقط الأسطح للافتراضي بأمان.
 * مفتاح كاش مستقل ['print-font'] تبطله بطاقة الإعداد عند الحفظ.
 */
export function usePrintFont(teacherId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['print-font', teacherId],
    enabled: Boolean(teacherId) && enabled && Boolean(supabase),
    queryFn: async (): Promise<PrintFontKey | null> => {
      const { data, error } = await supabase!
        .from('teacher_settings')
        .select('print_font')
        .eq('teacher_id', teacherId!)
        .maybeSingle()
      if (error) return null
      return normalizePrintFont(data?.print_font)
    },
  })
  return { printFont: query.data ?? null }
}
