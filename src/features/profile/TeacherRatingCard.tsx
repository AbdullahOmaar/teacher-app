import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FormError, TextArea } from '../../components/ui/form'
import { t } from '../../i18n'
import {
  fetchMyGuardianRating,
  fetchMyStudentRating,
  isProfileSchemaMissing,
  ratingErrorMessage,
  submitGuardianRating,
  submitStudentRating,
  type MyRating,
} from './api'
import { StarsPicker } from './Stars'

/**
 * بطاقة «قيّم مدرّسك» في البوابتين (0074 — 3A-929): تظهر فقط لمن له
 * تسجيل حقيقي عند المدرّس — الحاكم هو الـ RPC الخادمي (يرفض غير
 * المسجّل)، وأي خطأ في جلب التقييم الحالي يخفي البطاقة بصمت (سطح
 * اختياري لا يكسر البوابة). إعادة الإرسال تحدّث التقييم نفسه (upsert
 * على قيد التفرد) فلا تكرار أبداً. قبل تطبيق 0074 تختفي البطاقة عند
 * أول محاولة إرسال بدل أي خطأ خام.
 */
export function TeacherRatingCard({
  mode,
  rawToken,
  studentId,
}: {
  mode: 'guardian' | 'student'
  rawToken: string
  studentId?: string
}) {
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [thanks, setThanks] = useState(false)
  const [gone, setGone] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const mineQ = useQuery<MyRating | null>({
    queryKey: ['my-teacher-rating', mode, rawToken, studentId ?? ''],
    enabled: Boolean(rawToken) && (mode === 'student' || Boolean(studentId)),
    queryFn: () =>
      mode === 'guardian'
        ? fetchMyGuardianRating(rawToken, studentId as string)
        : fetchMyStudentRating(rawToken),
    retry: false,
  })

  useEffect(() => {
    if (!hydrated && mineQ.data !== undefined) {
      if (mineQ.data) {
        setStars(mineQ.data.stars)
        setComment(mineQ.data.comment ?? '')
      }
      setHydrated(true)
    }
  }, [mineQ.data, hydrated])

  const submit = useMutation({
    mutationFn: () =>
      mode === 'guardian'
        ? submitGuardianRating(
            rawToken,
            studentId as string,
            stars,
            comment.trim() === '' ? null : comment.trim(),
          )
        : submitStudentRating(
            rawToken,
            stars,
            comment.trim() === '' ? null : comment.trim(),
          ),
    onSuccess: () => {
      setError(null)
      setThanks(true)
    },
    onError: (e) => {
      if (isProfileSchemaMissing(e)) {
        setGone(true)
        return
      }
      setError(ratingErrorMessage(e))
    },
  })

  // تدهور صامت: خطأ الجلب (غير مسجّل/رمز منتهٍ) أو غياب المخطط
  if (gone || mineQ.isError || mineQ.isPending) return null

  return (
    <Card>
      <div className="type-section mb-1">{t('profile.rateTitle')}</div>
      <p className="text-muted type-secondary mb-3">{t('profile.rateHint')}</p>
      {mineQ.data ? (
        <p className="text-[13px] font-semibold text-primary mb-2">
          {t('profile.rateYoursLabel')}
        </p>
      ) : null}
      <StarsPicker value={stars} onChange={setStars} />
      <div className="mt-3">
        <TextArea
          value={comment}
          rows={2}
          maxLength={1000}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('profile.rateCommentPlaceholder')}
          aria-label={t('profile.rateCommentLabel')}
        />
      </div>
      {error ? <FormError message={error} /> : null}
      {thanks ? (
        <p className="text-ok font-semibold text-[14px] mt-3 mb-0">
          {t('profile.rateThanks')}
        </p>
      ) : (
        <Button
          className="mt-3"
          disabled={stars === 0 || submit.isPending}
          onClick={() => submit.mutate()}
        >
          <Send size={17} />
          {mineQ.data ? t('profile.rateUpdate') : t('profile.rateSubmit')}
        </Button>
      )}
    </Card>
  )
}
