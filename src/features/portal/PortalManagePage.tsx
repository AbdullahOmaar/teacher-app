import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { PageToolBar } from '../../components/ui/PageToolBar'
import { Link2, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { t } from '../../i18n'
import type { StudentRow } from '../../types/database'
import { tokenStatus } from './api'
import { PORTAL, useTeacherPortalTokens } from './hooks'
import { SG, useStudents } from '../students/hooks'
import { PortalLinkSheet } from './PortalLinkSheet'

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
        await qc.invalidateQueries({ queryKey: [PORTAL] })
        await qc.invalidateQueries({ queryKey: [SG] })
      }}
    >
    <div>
      <Card className="rise-in" style={{ animationDelay: '0ms' }}>
        <p className="text-[13.5px] mb-0 leading-relaxed">
          {t('portal.manageIntroPre')}{' '}
          <b>{t('portal.manageIntroDays')}</b> {t('portal.manageIntroPost')}
        </p>
      </Card>

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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[15px] truncate">{s.name}</div>
                  <div className="text-muted text-[13.5px] mt-0.5">
                    {t('portal.manageCodeLabel')} <span dir="ltr">{s.public_code}</span>
                    {s.grade ? t('portal.manageGradePart', { grade: s.grade }) : ''}
                    {s.guardian_phone ? (
                      <>
                        {t('portal.manageGuardianPart')} <span dir="ltr">{s.guardian_phone}</span>
                      </>
                    ) : (
                      t('portal.manageNoGuardian')
                    )}
                  </div>
                </div>
                {expiresAt ? (
                  <span className="shrink-0 text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2 py-0.5">
                    {t('portal.manageActiveUntil', { date: expiresAt.slice(0, 10) })}
                  </span>
                ) : (
                  <span className="shrink-0 text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2 py-0.5">
                    {t('portal.manageNoLink')}
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <Button variant="soft" onClick={() => setSelected(s)}>
                  <Link2 size={20} />
                  {t('portal.manageLinkAction')}
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
    </PullToRefresh>
  )
}
