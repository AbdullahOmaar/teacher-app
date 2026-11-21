import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Archive, ArchiveRestore, Construction, GraduationCap, IdCard, Link2, Lock, MessageCircle, Pencil, Phone, Trash2, TriangleAlert, UserRoundX, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { DangerConfirmSheet } from '../../components/ui/DangerConfirmSheet'
import { useToast } from '../../components/ui/toast'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { BILLING_LABELS, formatMoney, waLink } from '../../lib/format'
import { useGroups } from '../groups/hooks'
import {
  useDeleteEnrollment,
  useDeleteStudent,
  useSetStudentPaused,
  useStudent,
  useStudentBalances,
  useStudentEnrollments,
  useStudentFootprint,
} from './hooks'
import { StudentAttendanceTab } from '../attendance/StudentAttendanceTab'
import { StudentPaymentsTab } from '../invoices/StudentPaymentsTab'
import { StudentGradesTab } from '../grades/StudentGradesTab'
import { StudentFormSheet } from './StudentFormSheet'
import { StudentCardSheet } from './StudentCardSheet'
import { EnrollStudentSheet } from './EnrollStudentSheet'
import { PortalLinkSheet } from '../portal/PortalLinkSheet'
import { StudentPortalLinkSheet } from '../student-portal/StudentPortalLinkSheet'
import { t } from '../../i18n'

type TabKey = 'data' | 'groups' | 'att' | 'pay' | 'grades' | 'notes'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: t('students.detailTabData') },
  { key: 'groups', label: t('students.detailTabGroups') },
  { key: 'att', label: t('students.detailTabAtt') },
  { key: 'pay', label: t('students.detailTabPay') },
  { key: 'grades', label: t('students.detailTabGrades') },
  { key: 'notes', label: t('students.detailTabNotes') },
]

const UPCOMING: Record<string, string> = {
  notes: t('students.detailUpcomingNotes'),
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted text-[13.5px] font-semibold">{label}</span>
      <span className="text-[15px] font-semibold text-left"><bdi>{value?.trim() ? value : '—'}</bdi></span>
    </div>
  )
}

/**
 * ملف الطالب (المواصفات §3.4): ترويسة (اتصال/واتساب/الكارت الرقمي) وتبويبات.
 * «البيانات» و«المجموعات» و«الحضور» و«المدفوعات» و«الدرجات» منفذة فعلياً
 * (المدفوعات للمالك فقط)؛ الملاحظات هيكل جاهز لوحدتها القادمة.
 */
export function StudentDetailPage({ studentId }: { studentId?: string } = {}) {
  const params = useParams()
  // في نمط List-Detail (≥1024px) يمرَّر المعرّف من قائمة الطلاب؛
  // وصفحة التفاصيل المستقلة تقرأه من الرابط كالمعتاد (الروابط العميقة كما هي)
  const id = studentId ?? params.id
  const teacher = useCurrentTeacher()
  const [tab, setTab] = useState<TabKey>('data')
  const [editOpen, setEditOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)
  const [studentPortalOpen, setStudentPortalOpen] = useState(false)

  const navigate = useNavigate()
  const toast = useToast()
  const [dangerMode, setDangerMode] = useState<'archive' | 'delete' | null>(null)
  const [dangerError, setDangerError] = useState<string | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isAssistantRole = teacher.status === 'ready' && teacher.role === 'assistant'
  const studentQ = useStudent(teacherId, id)
  const enrollmentsQ = useStudentEnrollments(teacherId, id)
  const groupsQ = useGroups(teacherId)
  const balancesQ = useStudentBalances(teacherId)
  const setPaused = useSetStudentPaused(teacherId ?? '')
  const deleteEnrollment = useDeleteEnrollment(teacherId ?? '')
  const deleteStudent = useDeleteStudent(teacherId ?? '')
  // بصمة الطالب تُقرأ للمالك فقط: الفواتير محجوبة عن المساعد بـ RLS
  // فأعدادها عنده ستكون صفراً كاذبة — الحذف النهائي قرار مالك حصراً.
  const footprintQ = useStudentFootprint(teacherId, id, !isAssistantRole)

  const groupById = useMemo(
    () => new Map((groupsQ.data ?? []).map((g) => [g.id, g])),
    [groupsQ.data],
  )

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (studentQ.isPending || enrollmentsQ.isPending || groupsQ.isPending)
    return <LoadingState label={t('students.detailLoading')} />
  const error = studentQ.error ?? enrollmentsQ.error ?? groupsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : t('common.unknownError')}
        onRetry={() => {
          void studentQ.refetch()
          void enrollmentsQ.refetch()
          void groupsQ.refetch()
        }}
      />
    )

  const student = studentQ.data
  if (!student) {
    return (
      <EmptyState mascot mascotPose="oops" icon={UserRoundX} title={t('students.detailNotFoundTitle')} hint={t('students.detailNotFoundHint')} />
    )
  }

  const enrollments = enrollmentsQ.data ?? []
  const balance = balancesQ.data?.get(student.id) ?? 0
  // وجود صف رصيد = للطالب فواتير أصلاً؛ غيابه حالة محايدة لا «مسدد» (L1)
  const hasInvoices = balancesQ.data?.has(student.id) ?? false
  const isAssistant = teacher.role === 'assistant'
  const groupNames = enrollments
    .map((e) => groupById.get(e.group_id)?.name)
    .filter((n): n is string => Boolean(n))
  const wa = waLink(student.phone)

  const confirmDanger = async () => {
    if (!dangerMode) return
    setDangerError(null)
    try {
      if (dangerMode === 'archive') {
        await setPaused.mutateAsync({ studentId: student.id, paused: true })
        toast(t('students.detailArchivedToast', { name: student.name }))
        setDangerMode(null)
      } else {
        await deleteStudent.mutateAsync(student.id)
        toast(t('students.detailDeletedToast', { name: student.name }))
        setDangerMode(null)
        // الصفحة المستقلة ترجع لقائمة الطلاب؛ نمط List-Detail يتحدث تلقائياً بإبطال الكاش
        if (!studentId) navigate('/students', { replace: true })
      }
    } catch (e) {
      setDangerError(e instanceof Error ? e.message : t('groups.actionError'))
    }
  }

  return (
    <div>
      {/* الترويسة */}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="type-screen">
            {student.name}
            {student.paused && (
              <span className="ms-2 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 align-middle">
                {t('students.badgePaused')}
              </span>
            )}
          </div>
          {!isAssistant &&
            (balance > 0 ? (
              <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5">
                {t('students.badgeDue', { amount: formatMoney(balance) })}
              </span>
            ) : balancesQ.data && !hasInvoices ? (
              <span className="shrink-0 text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2 py-0.5">
                {t('students.badgeNoInvoices')}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                {t('students.badgePaid')}
              </span>
            ))}
        </div>
        <div className="text-muted text-[13.5px] mt-0.5">
          {t('students.detailCodePrefix')}<span dir="ltr">{student.public_code}</span>
          {student.grade ? t('students.metaItem', { value: student.grade ?? '' }) : ''}
          {student.school ? t('students.metaItem', { value: student.school ?? '' }) : ''}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {student.phone && (
            <a href={`tel:${student.phone}`} className="no-underline">
              <Button variant="soft">
                <Phone size={20} />
                {t('students.detailCallBtn')}
              </Button>
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="no-underline">
              <Button variant="soft">
                <MessageCircle size={20} />
                {t('students.detailWhatsappBtn')}
              </Button>
            </a>
          )}
          <Button variant="soft" onClick={() => setCardOpen(true)}>
            <IdCard size={20} />
            {t('students.detailCardBtn')}
          </Button>
          <Button variant="soft" onClick={() => setPortalOpen(true)}>
            <Link2 size={20} />
            {t('students.detailPortalBtn')}
          </Button>
          <Button variant="soft" onClick={() => setStudentPortalOpen(true)}>
            <GraduationCap size={20} />
            {t('students.detailStudentPortalBtn')}
          </Button>
          <Button variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={20} />
            {t('groups.edit')}
          </Button>
        </div>
      </Card>

      <ChipRow>
        {TABS.filter((tok) => !(isAssistant && tok.key === 'pay')).map((tok) => (
          <Chip key={tok.key} active={tab === tok.key} onClick={() => setTab(tok.key)}>
            {tok.label}
          </Chip>
        ))}
      </ChipRow>

      {tab === 'data' && (
        <>
          <Card>
            <InfoRow label={t('students.codeLabel')} value={student.public_code} />
            <InfoRow label={t('students.gradeLabel')} value={student.grade} />
            <InfoRow label={t('students.schoolLabel')} value={student.school} />
            <InfoRow label={t('students.studentPhoneLabel')} value={student.phone} />
            <InfoRow label={t('students.guardianLabel')} value={student.guardian_name} />
            <InfoRow label={t('students.guardianPhoneLabel')} value={student.guardian_phone} />
            <InfoRow label={t('students.detailLevelNoteLabel')} value={student.level_note} />
          </Card>

          {/* منطقة الخطر — حذف/أرشفة آمنة (خطوة 10):
              الأرشفة هي حالة «موقوف» القائمة (paused) — تُخفي الطالب من كل
              القوائم التشغيلية وتُبقي سجلاته المالية والتاريخية سليمة.
              الحذف النهائي للمالك فقط وبشرط غياب أي فاتورة/دفعة، وبعد كتابة
              اسم الطالب كاملاً في شاشة التأكيد. */}
          <Card className="border-bad/50">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert size={20} className="text-bad-text" />
              <span className="font-extrabold text-[15px] text-bad-text">{t('groups.dangerTitle')}</span>
            </div>

            {student.paused ? (
              <>
                <Button
                  variant="primary"
                  full
                  disabled={setPaused.isPending}
                  onClick={() =>
                    setPaused.mutate(
                      { studentId: student.id, paused: false },
                      {
                        onError: (e) =>
                          toast(
                            e instanceof Error ? e.message : t('students.detailUnarchiveError'),
                            'error',
                          ),
                      },
                    )
                  }
                >
                  <ArchiveRestore size={20} /> {t('students.detailUnarchiveBtn')}
                </Button>
                <p className="text-muted text-[13.5px] mt-2 mb-0">
                  {t('students.detailArchivedNote')}
                </p>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  full
                  className="text-bad-text border-bad/50"
                  onClick={() => {
                    setDangerError(null)
                    setDangerMode('archive')
                  }}
                >
                  <Archive size={20} /> {t('students.detailArchiveBtn')}
                </Button>
                <p className="text-muted text-[13.5px] mt-2 mb-0">
                  {t('students.detailArchiveNote')}
                </p>
              </>
            )}

            <div className="border-t border-border mt-3 pt-3">
              {isAssistant ? (
                <p className="text-muted text-[13.5px] m-0">
                  {t('groups.deleteOwnerOnly')}
                </p>
              ) : footprintQ.isPending ? (
                <p className="text-muted text-[13.5px] m-0">{t('students.detailFootprintChecking')}</p>
              ) : footprintQ.error ? (
                <p className="text-bad-text text-[13.5px] m-0">
                  {t('students.detailFootprintError')}
                </p>
              ) : footprintQ.data?.canDelete ? (
                <>
                  <Button
                    variant="danger"
                    full
                    onClick={() => {
                      setDangerError(null)
                      setDangerMode('delete')
                    }}
                  >
                    <Trash2 size={20} /> {t('students.detailDeleteBtn')}
                  </Button>
                  <p className="text-muted text-[13.5px] mt-2 mb-0">
                    {t('students.detailDeleteAllowedNote')}
                  </p>
                </>
              ) : (
                <p className="text-[13.5px] m-0 leading-relaxed">
                  <span className="font-bold text-bad-text">{t('groups.deleteBlockedPrefix')}</span>
                  {t('students.detailDeleteBlockedBody', { invoices: footprintQ.data?.invoiceCount ?? 0, payments: footprintQ.data?.paymentCount ?? 0 })}
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'groups' && (
        <div>
          {enrollments.length === 0 ? (
            <EmptyState icon={Users} title={t('students.detailNoGroupsTitle')} hint={t('students.detailNoGroupsHint')} />
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
                      className="text-bad-text text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer"
                      onClick={() => {
                        if (window.confirm(t('students.detailCancelEnrollConfirm', { student: student.name, group: g.name })))
                          deleteEnrollment.mutate(e.id, {
                            onError: (err) =>
                              toast(
                                err instanceof Error
                                  ? err.message
                                  : t('students.detailCancelEnrollError'),
                                'error',
                              ),
                          })
                      }}
                    >
                      {t('students.detailCancelEnrollBtn')}
                    </button>
                  </div>
                  <div className="text-muted text-[13.5px] mt-0.5">
                    {BILLING_LABELS[g.billing_type]}{t('students.detailEnrollPrice', { price: formatMoney(effective) })}
                    {e.price_override != null ? t('groups.detailSpecialPrice') : ''}
                    {e.prepaid_sessions != null ? t('groups.detailPrepaid', { count: e.prepaid_sessions }) : ''}
                  </div>
                </Card>
              )
            })
          )}
          <Button full onClick={() => setEnrollOpen(true)}>
            {t('students.detailEnrollBtn')}
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
            icon={Lock}
            title={t('students.detailPayOwnerOnlyTitle')}
            hint={t('students.detailPayOwnerOnlyHint')}
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
        <EmptyState icon={Construction} title={t('students.detailComingSoonTitle')} hint={UPCOMING[tab]} />
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
      {studentPortalOpen && (
        <StudentPortalLinkSheet
          teacherId={teacher.teacherId}
          student={student}
          onClose={() => setStudentPortalOpen(false)}
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

      <DangerConfirmSheet
        open={dangerMode !== null}
        title={dangerMode === 'delete' ? t('students.detailDeleteBtn') : t('students.detailArchiveBtn')}
        entityName={student.name}
        mode={dangerMode === 'delete' ? 'delete' : 'archive'}
        confirmLabel={dangerMode === 'delete' ? t('groups.confirmDelete') : t('students.detailConfirmArchive')}
        pending={setPaused.isPending || deleteStudent.isPending}
        error={dangerError}
        onConfirm={confirmDanger}
        onClose={() => setDangerMode(null)}
        lines={
          dangerMode === 'delete'
            ? [
                t('students.detailDeleteLine1', { name: student.name }),
                t('students.detailDeleteLine2'),
                t('students.detailDeleteLine3', { enrollments: footprintQ.data?.enrollmentCount ?? 0, attendance: footprintQ.data?.attendanceCount ?? 0, scores: footprintQ.data?.scoreCount ?? 0 }),
              ]
            : [
                t('students.detailArchiveLine1', { name: student.name }),
                t('students.detailArchiveLine2'),
                t('students.detailArchiveLine3'),
              ]
        }
      />
    </div>
  )
}
