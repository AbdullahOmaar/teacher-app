import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { BILLING_LABELS, formatMoney, waLink } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import {
  useDeleteEnrollment,
  useSetStudentPaused,
  useStudent,
  useStudentBalances,
  useStudentEnrollments,
} from './hooks'
import { StudentAttendanceTab } from '../attendance/StudentAttendanceTab'
import { StudentPaymentsTab } from '../invoices/StudentPaymentsTab'
import { StudentGradesTab } from '../grades/StudentGradesTab'
import { StudentFormSheet } from './StudentFormSheet'
import { StudentCardSheet } from './StudentCardSheet'
import { EnrollStudentSheet } from './EnrollStudentSheet'
import { PortalLinkSheet } from '../portal/PortalLinkSheet'

type TabKey = 'data' | 'groups' | 'att' | 'pay' | 'grades' | 'notes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'البيانات' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'att', label: 'الحضور' },
  { key: 'pay', label: 'المدفوعات' },
  { key: 'grades', label: 'الدرجات' },
  { key: 'notes', label: 'الملاحظات' },
]

const UPCOMING: Record<string, string> = {
  notes: 'ملاحظات الطالب المؤرخة هتتبني في خطوة لاحقة.',
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted text-[13px] font-semibold">{label}</span>
      <span className="text-[14px] font-semibold text-left">{value?.trim() ? value : '—'}</span>
    </div>
  )
}

/**
 * ملف الطالب (المواصفات §3.4): ترويسة (اتصال/واتساب/الكارت الرقمي) وتبويبات.
 * «البيانات» و«المجموعات» و«الحضور» و«المدفوعات» و«الدرجات» منفذة فعلياً
 * (المدفوعات للمالك فقط)؛ الملاحظات هيكل جاهز لوحدتها القادمة.
 */
export function StudentDetailPage() {
  const { id } = useParams()
  const teacher = useCurrentTeacher()
  const [tab, setTab] = useState<TabKey>('data')
  const [editOpen, setEditOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const studentQ = useStudent(teacherId, id)
  const enrollmentsQ = useStudentEnrollments(teacherId, id)
  const groupsQ = useGroups(teacherId)
  const balancesQ = useStudentBalances(teacherId)
  const setPaused = useSetStudentPaused(teacherId ?? '')
  const deleteEnrollment = useDeleteEnrollment(teacherId ?? '')

  const groupById = useMemo(
    () => new Map((groupsQ.data ?? []).map((g) => [g.id, g])),
    [groupsQ.data],
  )

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (studentQ.isPending || enrollmentsQ.isPending || groupsQ.isPending)
    return <LoadingState label="بنحمّل ملف الطالب…" />
  const error = studentQ.error ?? enrollmentsQ.error ?? groupsQ.error
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'خطأ غير معروف'} />

  const student = studentQ.data
  if (!student) {
    return (
      <EmptyState icon="🧑‍🎓" title="الطالب غير موجود" hint="ممكن يكون اتحذف أو الرابط غير صحيح" />
    )
  }

  const enrollments = enrollmentsQ.data ?? []
  const balance = balancesQ.data?.get(student.id) ?? 0
  const isAssistant = teacher.role === 'assistant'
  const groupNames = enrollments
    .map((e) => groupById.get(e.group_id)?.name)
    .filter((n): n is string => Boolean(n))
  const wa = waLink(student.phone)

  return (
    <div>
      {/* الترويسة */}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[18px] font-extrabold">
            {student.name}
            {student.paused && (
              <span className="ms-2 text-[11px] font-bold bg-warn/15 text-warn border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                موقوف
              </span>
            )}
          </div>
          {!isAssistant &&
            (balance > 0 ? (
              <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn border border-warn/40 rounded-full px-2 py-0.5">
                باقي {formatMoney(balance)}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok border border-ok/30 rounded-full px-2 py-0.5">
                مسدد
              </span>
            ))}
        </div>
        <div className="text-muted text-[13px] mt-0.5">
          الكود: <span dir="ltr">{student.public_code}</span>
          {student.grade ? ` · ${student.grade}` : ''}
          {student.school ? ` · ${student.school}` : ''}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {student.phone && (
            <a href={`tel:${student.phone}`} className="no-underline">
              <Button variant="soft">📞 اتصال</Button>
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="no-underline">
              <Button variant="soft">💬 واتساب</Button>
            </a>
          )}
          <Button variant="soft" onClick={() => setCardOpen(true)}>
            🪪 الكارت الرقمي
          </Button>
          <Button variant="soft" onClick={() => setPortalOpen(true)}>
            🔗 رابط ولي الأمر
          </Button>
          <Button variant="ghost" onClick={() => setEditOpen(true)}>
            ✏️ تعديل
          </Button>
        </div>
      </Card>

      <ChipRow>
        {TABS.filter((t) => !(isAssistant && t.key === 'pay')).map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      {tab === 'data' && (
        <Card>
          <InfoRow label="الكود" value={student.public_code} />
          <InfoRow label="الصف" value={student.grade} />
          <InfoRow label="المدرسة" value={student.school} />
          <InfoRow label="موبايل الطالب" value={student.phone} />
          <InfoRow label="ولي الأمر" value={student.guardian_name} />
          <InfoRow label="موبايل ولي الأمر" value={student.guardian_phone} />
          <InfoRow label="ملاحظة المستوى" value={student.level_note} />
          <div className="mt-3">
            <Button
              variant={student.paused ? 'primary' : 'danger'}
              full
              disabled={setPaused.isPending}
              onClick={() =>
                setPaused.mutate({ studentId: student.id, paused: !student.paused })
              }
            >
              {student.paused ? '▶️ استئناف الطالب' : '⏸️ إيقاف الطالب (أرشفة)'}
            </Button>
            <p className="text-muted text-[12px] mt-2 mb-0">
              الطالب الموقوف يُستبعد من إصدار الفواتير وقوائم الحضور، ويظهر فقط في فلتر «موقوف / أرشيف».
            </p>
          </div>
        </Card>
      )}

      {tab === 'groups' && (
        <div>
          {enrollments.length === 0 ? (
            <EmptyState icon="👨‍👩‍👧‍👦" title="غير مسجل في أي مجموعة" hint="سجّله في مجموعة علشان يبدأ الحضور والفوترة" />
          ) : (
            enrollments.map((e) => {
              const g = groupById.get(e.group_id)
              if (!g) return null
              const effective = e.price_override ?? g.price
              return (
                <Card key={e.id}>
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/groups/${g.id}`} className="font-bold text-[15px] text-text no-underline">
                      {g.name}
                    </Link>
                    <button
                      type="button"
                      className="text-bad text-[12.5px] font-semibold bg-transparent border-0 cursor-pointer"
                      onClick={() => {
                        if (window.confirm(`إلغاء تسجيل «${student.name}» من مجموعة «${g.name}»؟`))
                          deleteEnrollment.mutate(e.id)
                      }}
                    >
                      إلغاء التسجيل
                    </button>
                  </div>
                  <div className="text-muted text-[13px] mt-0.5">
                    {BILLING_LABELS[g.billing_type]} · السعر الفعلي: {formatMoney(effective)}
                    {e.price_override != null ? ' (سعر خاص)' : ''}
                    {e.prepaid_sessions != null ? ` · مدفوع مسبقاً: ${e.prepaid_sessions} حصة` : ''}
                  </div>
                </Card>
              )
            })
          )}
          <Button full onClick={() => setEnrollOpen(true)}>
            + تسجيل في مجموعة
          </Button>
        </div>
      )}

      {tab === 'att' && (
        <StudentAttendanceTab
          teacherId={teacher.teacherId}
          studentId={student.id}
          enrollments={enrollments}
          groupById={groupById}
        />
      )}

      {tab === 'pay' &&
        (isAssistant ? (
          <EmptyState
            icon="🔒"
            title="المدفوعات للمالك فقط"
            hint="تبويب المدفوعات مخفي في وضع المساعد — المالية محجوبة بـ RLS أيضاً."
          />
        ) : (
          <StudentPaymentsTab
            teacherId={teacher.teacherId}
            studentId={student.id}
            studentName={student.name}
          />
        ))}

      {tab === 'grades' && (
        <StudentGradesTab teacherId={teacher.teacherId} studentId={student.id} />
      )}

      {tab === 'notes' && (
        <EmptyState icon="🚧" title="قريباً" hint={UPCOMING[tab]} />
      )}

      {editOpen && (
        <StudentFormSheet
          onClose={() => setEditOpen(false)}
          teacherId={teacher.teacherId}
          groups={groupsQ.data ?? []}
          initial={student}
          initialEnrollments={enrollments}
        />
      )}
      {cardOpen && (
        <StudentCardSheet student={student} groupNames={groupNames} onClose={() => setCardOpen(false)} />
      )}
      {portalOpen && (
        <PortalLinkSheet
          teacherId={teacher.teacherId}
          student={student}
          onClose={() => setPortalOpen(false)}
        />
      )}
      {enrollOpen && (
        <EnrollStudentSheet
          onClose={() => setEnrollOpen(false)}
          teacherId={teacher.teacherId}
          groups={groupsQ.data ?? []}
          students={[student]}
          fixedStudentId={student.id}
          excludeGroupIds={new Set(enrollments.map((e) => e.group_id))}
        />
      )}
    </div>
  )
}
