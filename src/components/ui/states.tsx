import { Link } from 'react-router-dom'
import { AlertTriangle, GraduationCap, Lock, RotateCcw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { MascotLoader } from '../mascot/MascotLoader'
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
 * لودر الصفحة الموحّد — Overlay (ملاحظات المالك 2026-11-21، نقطة ٤):
 * دُفّي المتحرك (MascotLoader — أنيميشن اللودنج المعتمد) + سطر §٨
 * «ثواني… بقلّب في الدفتر.» في طبقة ثابتة متمركزة في منتصف الشاشة
 * فوق المحتوى (position: fixed — صفر أثر في تدفق التخطيط)، فيتبني
 * المحتوى/العظام تحتها وتختفي من فوقه بلا أي إزاحة. حلّ محلّ رأس
 * «بيفكّر» داخل التدفق (P-4) الذي كان يحجز ~56px فوق القوائم فيقفز
 * المحتوى عند ظهوره/اختفائه. محكوم بمفتاح «إظهار دُفّي»: عند إيقافه
 * يعرض MascotLoader لوجو الكتاب تلقائياً ويحلّ سطر تحميل محايد محلّ
 * سطر دُفّي (السطر صوته فلا يظهر من دونه)، وprefers-reduced-motion
 * يجمّد الحركة داخل MascotLoader نفسه.
 */
export function PageLoadingOverlay({ label }: { label?: string }) {
  const visible = useMascotVisible()
  return (
    <div
      data-loading-overlay
      role="status"
      aria-label={label ?? t('common.loading')}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-bg/70 backdrop-blur-[2px]"
    >
      <MascotLoader size={96} />
      <span className="text-muted type-secondary">
        {visible ? t('mascot.loading') : (label ?? t('common.loading'))}
      </span>
    </div>
  )
}

/**
 * تحميل أول لقائمة ثقيلة (طلاب/فواتير): لودر Overlay الموحّد فوق
 * هيكل صفوف يبدأ من موضعه النهائي مباشرة (لا رأس داخل التدفق).
 */
export function ListLoadingState({ label, rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label ?? t('common.loading')}>
      <PageLoadingOverlay label={label} />
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
 * تحميل موحد: لودر Overlay الموحّد (دُفّي المتحرك في منتصف الشاشة —
 * ملاحظات المالك نقطة ٤) فوق Skeleton بشكل المحتوى يبدأ من موضعه
 * النهائي. كان اللودر هنا داخل التدفق (~104px فوق البطاقات) فيقفز
 * المحتوى عند اختفائه؛ الآن بصمة اللودر في التخطيط صفر.
 */
export function LoadingState({ label = t('common.loading') }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <PageLoadingOverlay label={label} />
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
