import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Link2, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import type { StudentRow } from '../../types/database'
import { tokenStatus } from './api'
import { useTeacherPortalTokens } from './hooks'
import { useStudents } from '../students/hooks'
import { PortalLinkSheet } from './PortalLinkSheet'

/**
 * إدارة بوابة ولي الأمر (جهة المدرس، داخل التطبيق): قائمة الطلاب
 * وحالة رابط كل طالب، وإدارة الرابط من نفس الشيت المستخدم في ملف
 * الطالب. صفحة البوابة العامة نفسها على /portal بلا جلسة.
 */
export function PortalManagePage() {
  const teacher = useCurrentTeacher()
  const [selected, setSelected] = useState<StudentRow | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const studentsQ = useStudents(teacherId)
  const tokensQ = useTeacherPortalTokens(teacherId)

  const activeByStudent = useMemo(() => {
    const map = new Map<string, string>() // student_id → expires_at للرابط النشط
    for (const t of tokensQ.data ?? []) {
      if (t.student_id && tokenStatus(t) === 'active' && !map.has(t.student_id)) {
        map.set(t.student_id, t.expires_at)
      }
    }
    return map
  }, [tokensQ.data])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (studentsQ.isPending || tokensQ.isPending) return <LoadingState label="بنحمّل حالة الروابط…" />
  const error = studentsQ.error ?? tokensQ.error
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />

  const students = (studentsQ.data ?? []).filter((s) => !s.paused)

  return (
    <div>
      <Card>
        <p className="text-[13.5px] mb-0 leading-relaxed">
          كل طالب له رابط بوابة خاص بيه بيتبعت لولي أمره على واتساب، صالح{' '}
          <b>30 يوم</b> وبيعرض الحضور والدرجات والموقف المالي بس (قراءة فقط). إعادة توليد الرابط
          بتلغي القديم فوراً.
        </p>
      </Card>

      {students.length === 0 ? (
        <EmptyState icon={Users} title="مفيش طلاب نشطين" hint="ضيف طلاب الأول وبعدين ولّد روابط البوابة من هنا أو من ملف الطالب" />
      ) : (
        students.map((s) => {
          const expiresAt = activeByStudent.get(s.id)
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[15px] truncate">{s.name}</div>
                  <div className="text-muted text-[13.5px] mt-0.5">
                    الكود: <span dir="ltr">{s.public_code}</span>
                    {s.grade ? ` · ${s.grade}` : ''}
                    {s.guardian_phone ? (
                      <>
                        {' '}· ولي الأمر: <span dir="ltr">{s.guardian_phone}</span>
                      </>
                    ) : (
                      ' · مفيش رقم ولي أمر'
                    )}
                  </div>
                </div>
                {expiresAt ? (
                  <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                    رابط نشط حتى {expiresAt.slice(0, 10)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2 py-0.5">
                    لا يوجد رابط
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <Button variant="soft" onClick={() => setSelected(s)}>
                  <Link2 size={20} />
                  إدارة الرابط
                </Button>
              </div>
            </Card>
          )
        })
      )}

      {selected && (
        <PortalLinkSheet
          teacherId={teacher.teacherId}
          student={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
