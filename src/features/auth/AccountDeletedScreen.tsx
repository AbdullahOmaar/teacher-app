/**
 * شاشة «الحساب محذوف» المصممة (مهاجرة 0075 — F1 من اختبار سند).
 *
 * تظهر عندما تحلّ الهوية سنتراً أساسياً معلّماً بـ deleted_at بينما
 * ما زالت هناك جلسة حية (شبكة أمان: الأصل أن الخادم قطع الجلسات
 * وحظر الدخول، فلا يصل المستخدم هنا إلا بتوكن لم ينتهِ بعد). لا
 * بيانات تُعرض إطلاقاً — شرح الحذف وتاريخ التصفية النهائية (نهاية
 * نافذة السماح: 30 يوماً من deleted_at، نفس عقد المهاجرة) وزر خروج.
 */
import { Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { t } from '../../i18n'

const GRACE_DAYS = 30

export function AccountDeletedScreen({ deletedAt }: { deletedAt: string }) {
  const { signOut } = useAuth()
  const deletedDate = new Date(deletedAt)
  const purgeDate = new Date(deletedDate.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) =>
    Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG')

  return (
    <Card className="rise-in">
      <h2 className="type-section mt-0 mb-1 flex items-center gap-2">
        <Trash2 size={22} className="text-bad-text" />
        {t('settings.accountDeletedTitle')}
      </h2>
      <p className="text-[13.5px] text-muted mt-0 mb-4">
        {t('settings.accountDeletedBody', {
          date: fmt(deletedDate),
          purgeDate: fmt(purgeDate),
        })}
      </p>
      <Button
        full
        variant="ghost"
        onClick={() => {
          void signOut()
        }}
      >
        {t('settings.accountDeletedSignOut')}
      </Button>
    </Card>
  )
}
