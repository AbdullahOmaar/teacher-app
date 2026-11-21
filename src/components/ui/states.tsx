import { Link } from 'react-router-dom'
import { AlertTriangle, GraduationCap, Lock, RotateCcw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { MascotLoader } from '../mascot/MascotLoader'
import { Mascot } from '../mascot/Mascot'
import { useMascotVisible } from '../mascot/useMascotVisible'
import { t } from '../../i18n'

/** هيكل تحميل بشكل المحتوى (Skeleton) — نبض موحد بلون الحاويات */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-soft rounded-2xl ${className}`} aria-hidden="true" />
}

/** هيكل صفوف قائمة (أفاتار + سطران) */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * رأس سكيليتون «بيفكّر» (خطة الهوية P-4): دُفّي صغير بوضع التفكير
 * الحقيقي + سطر التحميل من §٨ فوق عظام القائمة في التحميل الأول فقط.
 * الصورة ثابتة عمداً (نبض العظام هو الحركة الوحيدة الظاهرة)، وعند
 * إيقاف الماسكوت من الإعدادات يختفي الرأس كله وتبقى العظام وحدها —
 * السطر صوت دُفّي فلا يظهر من دونه.
 */
export function ThinkingSkeletonHead() {
  const visible = useMascotVisible()
  if (!visible) return null
  return (
    <div className="flex items-center gap-2 pb-3" aria-hidden="true">
      <Mascot state="thinking" size={44} still />
      <span className="text-muted type-secondary">{t('mascot.loading')}</span>
    </div>
  )
}

/**
 * تحميل أول لقائمة ثقيلة (طلاب/فواتير): رأس «بيفكّر» + هيكل صفوف.
 * للتحميلات العامة/الجلسة يبقى LoadingState بلوجو التحميل كما هو.
 */
export function ListLoadingState({ label, rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label ?? t('common.loading')}>
      <ThinkingSkeletonHead />
      <SkeletonRows rows={rows} />
    </div>
  )
}

/** هيكل بطاقات */
export function SkeletonCards({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={t('common.loading')}>
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-[88px]" />
      ))}
    </div>
  )
}

/** حالة غياب الجلسة — لا بيانات وهمية أبداً: توجيه واضح لتسجيل الدخول */
export function SignInRequired() {
  return (
    <Card className="text-center py-8">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Lock size={28} />
      </div>
      <div className="type-section mb-1">{t('common.signInFirst')}</div>
      <p className="text-muted type-secondary mb-4">
        {t('common.signInFirstBody')}
      </p>
      <Link to="/login">
        <Button>{t('common.signIn')}</Button>
      </Link>
    </Card>
  )
}

/** مسجل دخول لكن لا يوجد ملف مدرس مرتبط بالحساب بعد */
export function NoTeacherProfile() {
  return (
    <Card className="text-center py-8">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <GraduationCap size={28} />
      </div>
      <div className="type-section mb-1">{t('common.noTeacherTitle')}</div>
      <p className="text-muted type-secondary mb-0">
        {t('common.noTeacherBody')}
      </p>
    </Card>
  )
}

/**
 * تحميل موحد: لوجو دُفّي المتحرك (قرار المالك: دُفّي هو لوجو التحميل
 * العام — MASCOT-PLAN §٤) فوق Skeleton بشكل المحتوى. عند إيقاف
 * الماسكوت من الإعدادات يعرض MascotLoader لوجو الكتاب مكانه تلقائياً.
 */
export function LoadingState({ label = t('common.loading') }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="flex justify-center pt-2 pb-4">
        <MascotLoader size={72} />
      </div>
      <SkeletonCards cards={3} />
    </div>
  )
}

/** خطأ موحد: شرح + زر إعادة محاولة دائماً (بحث §5) — onRetry اختياري للتوافق الخلفي */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <Card className="text-center py-6">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-bad-soft text-bad-text flex items-center justify-center">
        <AlertTriangle size={28} />
      </div>
      <div className="type-section text-bad-text mb-1">{t('common.errorTitle')}</div>
      <p className="text-muted type-secondary mb-4 break-words">{message}</p>
      {onRetry && (
        <Button variant="soft" onClick={onRetry}>
          <RotateCcw size={18} />
          {t('common.retry')}
        </Button>
      )}
    </Card>
  )
}
