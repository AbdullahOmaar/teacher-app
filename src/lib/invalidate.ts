import type { QueryClient } from '@tanstack/react-query'

/**
 * إبطال كاش مركزي بالمبادئ (PAT-1 — مراجعة ما بعد الموجة + 3A-296):
 * كل طفرة تعلن مجموعة المبادئ المتأثرة بها عبر هذه الدالة حصراً، حتى
 * تكون خريطة الإبطال قابلة للمراجعة في موضع واحد لكل وحدة بدل سلاسل
 * invalidateQueries مبعثرة (وبعضها كان ناقصاً: التحليلات والمعرّضون
 * لم يكونا يُبطَلان أبداً من طفرات الفلوس/الحضور، وإنشاء طالب/مجموعة
 * لم يكن يبطل الرئيسية). القاعدة: أي وحدة مشتقة من جداول وحدة أخرى
 * (التحليلات/المعرّضون/الرئيسية) يجب أن تظهر في مجموعة كل طفرة تكتب
 * في تلك الجداول.
 */
export function invalidatePrefixes(qc: QueryClient, prefixes: readonly string[]): void {
  for (const prefix of prefixes) {
    void qc.invalidateQueries({ queryKey: [prefix] })
  }
}
