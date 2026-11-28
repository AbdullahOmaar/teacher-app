import { db } from '../../lib/supabase'

// ============================================================================
// حالة «شوهدت» لنظام «جديد» (مهاجرة 0073): قراءة/ختم صفوف
// teacher_feature_seen — الحالة لكل مدرس (سنتر) لا لكل فرد، وRLS
// تسمح للمالك أو أي عضو فعّال (نمط سجل النشاط). قبل تطبيق 0073
// يفشل الاستعلام فيبقى المستهلك بلا بيانات فلا تظهر أي شارة —
// تدهور معلن ومقصود (نفس نمط عدّاد ملاحظات 0052).
// ============================================================================

/** معرّفات الخصائص المشاهَدة لهذا المدرس */
export async function fetchSeenFeatureIds(teacherId: string): Promise<string[]> {
  const { data, error } = await db()
    .from('teacher_feature_seen')
    .select('feature_id')
    .eq('teacher_id', teacherId)
  if (error) throw error
  return (data ?? []).map((r) => r.feature_id)
}

/** ختم خاصية «شوهدت» — idempotent بقيد (teacher_id, feature_id) */
export async function markFeatureSeen(
  teacherId: string,
  featureId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await db()
    .from('teacher_feature_seen')
    .upsert(
      { teacher_id: teacherId, feature_id: featureId, seen_by: userId },
      { onConflict: 'teacher_id,feature_id', ignoreDuplicates: true },
    )
  if (error) throw error
}
