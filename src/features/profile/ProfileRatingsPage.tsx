import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Chip } from '../../components/ui/form'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { t } from '../../i18n'
import { useStudents } from '../students/hooks'
import { isProfileSchemaMissing } from './api'
import { useMyRatings, useSetRatingHidden } from './hooks'
import { ProfileComingSoon, ProfileManageShell } from './ManageShell'
import { StarsRow } from './Stars'

/**
 * شاشة «تقييماتي» (0074): المدرّس يرى التقييمات الحقيقية (طلاب/
 * أولياء مسجّلون فعلياً عنده) ويقدر يخفي/يظهر — لا تعديل ولا حذف
 * أبداً (سلامة الإشراف: set_teacher_rating_hidden هو السطح الوحيد).
 */
function RatingsManager({ teacherId }: { teacherId: string }) {
  const toast = useToast()
  const ratingsQ = useMyRatings(teacherId, true)
  const studentsQ = useStudents(teacherId)
  const setHidden = useSetRatingHidden()

  if (ratingsQ.isPending) return <LoadingState />
  if (ratingsQ.isError) {
    if (isProfileSchemaMissing(ratingsQ.error)) return <ProfileComingSoon />
    return (
      <ErrorState
        message={t('profile.errSaveGeneric')}
        onRetry={() => void ratingsQ.refetch()}
      />
    )
  }

  const nameOf = (studentId: string) =>
    studentsQ.data?.find((s) => s.id === studentId)?.name ?? '—'

  return (
    <div>
      <p className="text-muted type-secondary mb-3">{t('profile.ratingsManageHint')}</p>
      {ratingsQ.data.length === 0 ? (
        <Card className="text-center py-6">
          <p className="text-muted type-secondary mb-0">
            {t('profile.emptyManageRatings')}
          </p>
        </Card>
      ) : (
        ratingsQ.data.map((rating) => (
          <Card key={rating.id}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-[14.5px]">
                {rating.reviewer_kind === 'guardian'
                  ? t('profile.fromGuardian', { name: nameOf(rating.student_id) })
                  : t('profile.fromStudent', { name: nameOf(rating.student_id) })}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {rating.is_hidden ? <Chip>{t('profile.hiddenChip')}</Chip> : null}
                <StarsRow stars={rating.stars} size={14} />
              </span>
            </div>
            {rating.comment ? (
              <p className="text-muted type-secondary mb-3">{rating.comment}</p>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={setHidden.isPending}
              onClick={() =>
                setHidden.mutate(
                  { ratingId: rating.id, hidden: !rating.is_hidden },
                  {
                    onSuccess: () => toast(t('profile.savedToast')),
                    onError: () => toast(t('profile.errSaveGeneric')),
                  },
                )
              }
            >
              {rating.is_hidden ? t('profile.showAction') : t('profile.hideAction')}
            </Button>
          </Card>
        ))
      )}
    </div>
  )
}

export function ProfileRatingsPage() {
  return (
    <ProfileManageShell>
      {({ teacherId }) => <RatingsManager teacherId={teacherId} />}
    </ProfileManageShell>
  )
}
