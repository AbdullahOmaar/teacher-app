import { invalidatePrefixes } from '../../lib/invalidate'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Card } from '../../components/ui/Card'
import { Users } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Fab } from '../../components/ui/Fab'
import { PermissionDeniedCard } from '../../components/ui/PermissionDeniedCard'
import { Chip, ChipRow } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { BILLING_LABELS, DAY_NAMES, formatMoney, formatTime12 } from '../../lib/format'
import { canReadOperational } from '../auth/api'
import { SG, useEnrollments } from '../students/hooks'
import { countByGroup } from './api'
import { groupSlotsOf } from './slots'
import { useGroups } from './hooks'
import { GroupFormSheet } from './GroupFormSheet'

/**
 * شاشة المجموعات (المواصفات §3.9): بطاقة لكل مجموعة (نظام الفوترة · السعر ·
 * الأيام · الميعاد والمدة) وشريط سعة عند وجود حد. الضغط يفتح تفاصيل المجموعة.
 */
type GroupFilter = 'active' | 'archived'

export function GroupsPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<GroupFilter>('active')

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const groupsQ = useGroups(teacherId)
  const enrollmentsQ = useEnrollments(teacherId)

  const counts = useMemo(() => countByGroup(enrollmentsQ.data ?? []), [enrollmentsQ.data])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (groupsQ.isPending || enrollmentsQ.isPending) return <LoadingState label={t('groups.listLoading')} />
  const error = groupsQ.error ?? enrollmentsQ.error
  if (error)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : t('common.unknownError')}
        onRetry={() => void invalidatePrefixes(qc, [SG])}
      />
    )

  const allGroups = groupsQ.data ?? []
  // عيب صلاحيات المساعد (رد سند 93 — 0079): مساعد بلا أي صلاحية تشغيلية
  // لا يقرأ المجموعات أصلاً (RLS) — بطاقة صلاحية صريحة (نمط المالية)
  // بدل حالة الفراغ المضللة. وزر الإنشاء مقيد بمفتاح إدارة المجموعات.
  const permissions = teacher.permissions
  if (teacher.role === 'assistant' && !canReadOperational(permissions)) {
    return (
      <PermissionDeniedCard
        title={t('groups.noPermissionTitle')}
        body={t('groups.noPermissionBody')}
      />
    )
  }
  const canManageGroups = permissions.can_manage_groups
  // القائمة الافتراضية تعرض النشطة فقط؛ المؤرشفة في فلترها الخاص (خطوة 10)
  const groups = allGroups.filter((g) =>
    filter === 'archived' ? g.archived_at != null : g.archived_at == null,
  )
  const hasArchived = allGroups.some((g) => g.archived_at != null)

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [SG])}>
    <div>
      {allGroups.length > 0 && (
        <ChipRow>
          <Chip active={filter === 'active'} onClick={() => setFilter('active')}>
            {t('groups.filterActive')}
          </Chip>
          <Chip active={filter === 'archived'} onClick={() => setFilter('archived')}>
            {t('groups.filterArchived')}
          </Chip>
        </ChipRow>
      )}
      {allGroups.length === 0 ? (
        <EmptyState
          mascot
          icon={Users}
          title={t('groups.listEmptyTitle')}
          hint={t('groups.listEmptyHint')}
          action={
            canManageGroups
              ? { label: t('groups.listEmptyAction'), onClick: () => setFormOpen(true) }
              : undefined
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          mascot
          icon={Users}
          title={filter === 'archived' ? t('groups.listEmptyArchivedTitle') : t('groups.listEmptyActiveTitle')}
          hint={
            filter === 'archived'
              ? t('groups.listEmptyArchivedHint')
              : hasArchived
                ? t('groups.listEmptyActiveHint')
                : undefined
          }
        />
      ) : (
        groups.map((g, i) => {
          const cnt = counts.get(g.id) ?? 0
          const pct = g.capacity ? Math.min(100, Math.round((cnt / g.capacity) * 100)) : null
          return (
            <Link key={g.id} to={`/groups/${g.id}`} className="block no-underline text-text">
              <Card
                className={`rise-in ${g.archived_at != null ? 'opacity-70' : ''}`}
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                {/* (مراجعة المالك الحية 2026-11-28 — تخطيط كارت المجموعة،
                    نفس نمط شارة الفاتورة في PR #76): سطر الاسم أولاً وشارة
                    الحالة قصاده في الطرف المقابل (أقصى الشمال بصرياً) في
                    نفس السطر — لا سطر مستقل للشارة. الاسم يُختصر بنقاط قبل
                    الشارتين دائماً والشارتان ثابتتا الانكماش، فيحلّ هذا محل
                    الالتفاف المقصود القديم (اسم طويل + شارة مساعد كانا
                    ينضغطان فتلتف الشارة داخل كبسولتها لسطرين). */}
                <div className="flex items-center gap-x-3">
                  <span className="shrink-0 w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center">
                    <Users size={20} />
                  </span>
                  <span className="font-bold text-[16px] flex-1 min-w-0 truncate">{g.name}</span>
                  {g.assistant_name && (
                    <span className="shrink-0 max-w-[38%] truncate text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                      {t('groups.detailAssistant', { name: g.assistant_name })}
                    </span>
                  )}
                  {g.archived_at != null && (
                    <span className="shrink-0 text-[12px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 whitespace-nowrap">
                      {t('groups.badgeArchived')}
                    </span>
                  )}
                </div>
                {/* البيانات الوصفية سطراً سطراً (قاعدة المالك نفسها):
                    سطر الوصف (نظام الفوترة · السعر · الميعاد والمدة ·
                    القاعة) في سطر واحد، والأيام في سطر لوحدها — كانت
                    كلها مدموجة في سطر واحد مع الأيام. */}
                <div className="text-muted text-[13.5px] mt-1">
                  {BILLING_LABELS[g.billing_type]} · {formatMoney(g.price)} ·{' '}
                  {groupSlotsOf(g)
                    .map(
                      (s) =>
                        `${DAY_NAMES[s.day]} ${formatTime12(s.start_time)} ${t('groups.listDuration', { minutes: s.duration_minutes })}`,
                    )
                    .join(' · ')}
                  {g.room ? (
                    <>
                      {' · '}
                      <span className="whitespace-nowrap">{g.room}</span>
                    </>
                  ) : (
                    ''
                  )}
                </div>
                {g.capacity != null && pct != null ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-[13.5px] text-muted mb-1">
                      <span>
                        {t('groups.listCapacityCount', { count: cnt, capacity: g.capacity })}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-soft overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? 'bg-bad' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-muted text-[13.5px] mt-1">{t('groups.listEnrolledCount', { count: cnt })}</div>
                )}
              </Card>
            </Link>
          )
        })
      )}

      {canManageGroups && (
        <Fab onClick={() => setFormOpen(true)} ariaLabel={t('groups.fabAria')} label={t('groups.formCreateTitle')} />
      )}

      {formOpen && (
        <GroupFormSheet
          onClose={() => setFormOpen(false)}
          teacherId={teacher.teacherId}
          groups={groups}
          initial={null}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
