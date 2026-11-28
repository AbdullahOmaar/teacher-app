import { Megaphone, Wrench, Info } from 'lucide-react'
import { t } from '../../i18n'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import {
  ErrorState,
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
} from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { invalidatePrefixes } from '../../lib/invalidate'
import { useQueryClient } from '@tanstack/react-query'
import { announcementKindLabel, type AnnouncementKind } from './api'
import { SUPPORT, useMyAnnouncements } from './hooks'
import { FeatureIntro } from '../newFeatures/FeatureIntro'
import { formatDateLabel } from '../schedule/api'

const KIND_ICON: Record<AnnouncementKind, typeof Info> = {
  update: Megaphone,
  maintenance: Wrench,
  general: Info,
}

/**
 * إعلانات المنصة لطرف المدرس (مهمة 17 — 0065): قائمة منشورة فقط عبر
 * RPC — حتى تطبيق 0065 تعرض «قريباً» مصممة (لا خطأ خام — قاعدة
 * مالك 2026-11-26).
 */
export function AnnouncementsPage() {
  const teacher = useCurrentTeacher()
  const qc = useQueryClient()
  const listQ = useMyAnnouncements(teacher.status === 'ready')

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const items = listQ.data ?? []

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [SUPPORT])}>
      <div>
        <FeatureIntro featureId="platform-announcements" />
        <p className="text-muted text-[13.5px] leading-[1.8] mb-3 mt-0 rise-in">
          {t('support.announcementsIntro')}
        </p>

        {listQ.isPending ? (
          <LoadingState />
        ) : listQ.data === null ? (
          <Card>
            <EmptyState
              icon={Megaphone}
              title={t('support.announcementsComingSoonTitle')}
              hint={t('support.announcementsComingSoonHint')}
            />
          </Card>
        ) : listQ.isError ? (
          <ErrorState
            message={t('support.announcementsLoadError')}
            onRetry={() => void listQ.refetch()}
          />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Megaphone}
              title={t('support.announcementsEmpty')}
            />
          </Card>
        ) : (
          items.map((row, i) => {
            const Icon = KIND_ICON[row.kind]
            return (
              <Card
                key={row.id}
                className="rise-in mb-3"
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-9 h-9 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
                    <Icon size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[15px]">{row.title}</div>
                    <div className="text-muted text-[12.5px]">
                      {announcementKindLabel(row.kind)} —{' '}
                      {formatDateLabel(row.publishedAt)}
                      {row.kind === 'maintenance' && row.scheduledAt
                        ? ` — ${t('support.scheduledLabel')}: ${formatDateLabel(row.scheduledAt)}`
                        : ''}
                    </div>
                  </div>
                </div>
                <p className="text-[14px] leading-[1.8] mb-0 whitespace-pre-wrap">
                  {row.body}
                </p>
              </Card>
            )
          })
        )}
      </div>
    </PullToRefresh>
  )
}
