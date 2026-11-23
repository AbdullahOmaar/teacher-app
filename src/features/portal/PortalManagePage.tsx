import { invalidatePrefixes } from '../../lib/invalidate'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { PageToolBar } from '../../components/ui/PageToolBar'
import { Eye, Link2, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import type { StudentRow } from '../../types/database'
import { tokenStatus } from './api'
import type { PortalAccessSettings } from './accounts'
import type { GuardianSectionKey, StudentSectionKey } from './tokenLifecycle'
import { formatDateLabel } from '../schedule/api'
import {
  PORTAL,
  usePortalAccessSettings,
  useTeacherPortalTokens,
  useUpdatePortalAccessSettings,
} from './hooks'
import { SG, useStudents } from '../students/hooks'
import { PortalLinkSheet } from './PortalLinkSheet'
import { LinkDurationField } from './accessUi'

const GUARDIAN_TOGGLES: { key: GuardianSectionKey; label: string }[] = [
  { key: 'attendance', label: t('portal.secGuardianAttendance') },
  { key: 'scores', label: t('portal.secGuardianScores') },
  { key: 'notes', label: t('portal.secGuardianNotes') },
  { key: 'money', label: t('portal.secGuardianMoney') },
  { key: 'groups', label: t('portal.secGuardianGroups') },
]

const STUDENT_TOGGLES: { key: StudentSectionKey; label: string }[] = [
  { key: 'schedule', label: t('portal.secStudentSchedule') },
  { key: 'homework', label: t('portal.secStudentHomework') },
  { key: 'grades', label: t('portal.secStudentGrades') },
  { key: 'money', label: t('portal.secStudentMoney') },
]

/**
 * بطاقة إعدادات دخول البوابات (3A-385): مدة الرابط الافتراضية + أقسام
 * كل بوابة الظاهرة — الحفظ فوري عند كل تغيير (نمط بطاقات الإعدادات)،
 * والفرض خادمي: القسم المخفي لا تصل بياناته للبوابة أصلاً (0038/0039).
 */
function PortalAccessSettingsCard({ teacherId }: { teacherId: string }) {
  const settingsQ = usePortalAccessSettings(teacherId)
  const update = useUpdatePortalAccessSettings(teacherId)
  const toast = useToast()
  const settings = settingsQ.data
  // مسودة مدة محلية: الكتابة في حقل المخصص لا تحفظ عند كل رقم —
  // الحفظ عند تثبيت الاختيار فقط (onCommit)
  const [ttlDraft, setTtlDraft] = useState<number | null>(null)

  const save = (next: PortalAccessSettings) =>
    update.mutate(next, {
      onSuccess: () => toast(t('portal.accessSavedToast')),
      onError: () => toast(t('portal.accessSaveErrorToast'), 'error'),
    })

  return (
    <Card className="rise-in" style={{ animationDelay: '25ms' }}>
      <h3 className="type-section mt-0 mb-2 flex items-center gap-2">
        <Eye size={22} className="text-primary" />
        {t('portal.accessSettingsTitle')}
      </h3>
      {settingsQ.isPending || !settings ? (
        <p className="text-muted text-[13.5px] mb-0">{t('portal.accessSettingsLoading')}</p>
      ) : (
        <>
          <LinkDurationField
            value={ttlDraft ?? settings.ttlDays}
            onChange={setTtlDraft}
            onCommit={(days) => {
              setTtlDraft(null)
              save({ ...settings, ttlDays: days })
            }}
          />
          <div className="text-[13.5px] font-bold mt-2 mb-1">{t('portal.accessGuardianSectionsTitle')}</div>
          {GUARDIAN_TOGGLES.map((row) => (
            <label key={row.key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
              <span className="text-[14px] font-semibold">{row.label}</span>
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-primary"
                checked={settings.guardian[row.key]}
                disabled={update.isPending}
                onChange={(e) =>
                  save({ ...settings, guardian: { ...settings.guardian, [row.key]: e.target.checked } })
                }
              />
            </label>
          ))}
          <div className="text-[13.5px] font-bold mt-3 mb-1">{t('portal.accessStudentSectionsTitle')}</div>
          {STUDENT_TOGGLES.map((row) => (
            <label key={row.key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
              <span className="text-[14px] font-semibold">{row.label}</span>
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-primary"
                checked={settings.student[row.key]}
                disabled={update.isPending}
                onChange={(e) =>
                  save({ ...settings, student: { ...settings.student, [row.key]: e.target.checked } })
                }
              />
            </label>
          ))}
        </>
      )}
    </Card>
  )
}

/**
 * إدارة بوابة ولي الأمر (جهة المدرس، داخل التطبيق): قائمة الطلاب
 * وحالة رابط كل طالب، وإدارة الرابط من نفس الشيت المستخدم في ملف
 * الطالب. صفحة البوابة العامة نفسها على /portal بلا جلسة.
 */
export function PortalManagePage() {
  const teacher = useCurrentTeacher()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<StudentRow | null>(null)
  const [search, setSearch] = useState('')

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

  const students = useMemo(
    () => (studentsQ.data ?? []).filter((s) => !s.paused),
    [studentsQ.data],
  )

  // بحث فوري (و-7أ): الصفحة كانت بلا أي حقل بحث رغم عشرات الطلاب —
  // التصفية بنفس حقول قائمة الطلاب (اسم/كود/موبايل الطالب وولي أمره)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      [s.name, s.public_code, s.phone ?? '', s.guardian_phone ?? '', s.grade ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [students, search])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (studentsQ.isPending || tokensQ.isPending) return <LoadingState label={t('portal.manageLoading')} />
  const error = studentsQ.error ?? tokensQ.error
  if (error) return <ErrorState message={error instanceof Error ? error.message : t('common.unknownError')} />

  return (
    <PullToRefresh
      onRefresh={async () => {
        await invalidatePrefixes(qc, [PORTAL, SG])
      }}
    >
    <div>
      <Card className="rise-in" style={{ animationDelay: '0ms' }}>
        {/* مقدمة مختصرة بسطر واحد (3A-384 — ٥-ي): الشرح الطويل
            بمدة الصلاحية الثابتة أُزيل؛ مدة الرابط نفسها يعيد
            تصميمها بند 3A-385 المستقل */}
        <p className="text-[13.5px] mb-0 leading-relaxed">
          {t('portal.manageIntroShort')}
        </p>
      </Card>

      <PortalAccessSettingsCard teacherId={teacher.teacherId} />

      {students.length > 0 && (
        <PageToolBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: t('portal.manageSearchPlaceholder'),
          }}
          resultCount={filtered.length}
        />
      )}

      {students.length === 0 ? (
        <EmptyState icon={Users} title={t('portal.manageEmptyTitle')} hint={t('portal.manageEmptyHint')} />
      ) : filtered.length === 0 ? (
        <Card className="rise-in" style={{ animationDelay: '50ms' }}>
          <EmptyState icon={Users} title={t('portal.manageNoMatchTitle')} hint={t('portal.manageNoMatchHint')} />
        </Card>
      ) : (
        filtered.map((s, i) => {
          const expiresAt = activeByStudent.get(s.id)
          return (
            <Card key={s.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              {/* «إدارة الرابط»: زر صغير في طرف البطاقة بجانب بيانات
                  الطالب (3A-384 — قاعدة المالك ٦-١) بدل زر وحيد على
                  سطر كامل تحتها */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] truncate">{s.name}</div>
                  <div className="text-muted text-[13.5px] mt-0.5">
                    {t('portal.manageCodeLabel')} <span dir="ltr">{s.public_code}</span>
                    {s.grade ? t('portal.manageGradePart', { grade: s.grade }) : ''}
                    {s.guardian_phone ? (
                      <>
                        <span className="whitespace-nowrap">{t('portal.manageGuardianPart')}</span>{' '}
                        <span dir="ltr">{s.guardian_phone}</span>
                      </>
                    ) : (
                      t('portal.manageNoGuardian')
                    )}
                  </div>
                </div>
                <Button variant="soft" size="sm" className="shrink-0" onClick={() => setSelected(s)}>
                  <Link2 size={16} />
                  {t('portal.manageLinkAction')}
                </Button>
              </div>
              {/* (3A-651 — نمط الصف المنظّم): شارة الحالة على سطرها الخاص
                  بعرض البطاقة الكامل — كانت داخل عمود النص بجانب الزر
                  فالتفّت على سطرين وانكسرت («2026» وحدها على سطر في لقطة
                  المالك). الآن inline-flex + nowrap فلا تلتف أبدًا */}
              <div className="mt-1.5">
                {expiresAt ? (
                  <span className="inline-flex items-center whitespace-nowrap text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                    {t('portal.manageActiveUntil', { date: formatDateLabel(expiresAt.slice(0, 10)) })}
                  </span>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2 py-0.5">
                    {t('portal.manageNoLink')}
                  </span>
                )}
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
    </PullToRefresh>
  )
}
