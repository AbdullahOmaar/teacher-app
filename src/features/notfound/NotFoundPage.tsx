import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { t } from '../../i18n'

/**
 * صفحة 404 (خطة الهوية P-5): قبلها لم يكن في App.tsx أي مسار catch-all
 * فأي رابط خاطئ كان يعني فراغاً. الآن دُفّي بوضع الأوبس + عنوان الخطة
 * «الصفحة دي مش في الدفتر» + زر رجوع للرئيسية. تُركَّب مرتين: داخل قشرة
 * التطبيق للجلسة المسجّلة، ومنفردة (standalone) لأي مسار علوي مجهول —
 * وفي الحالتين يحكم مفتاح «إظهار دُفّي» الصورة عبر EmptyState/Mascot.
 */
export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const navigate = useNavigate()
  const body = (
    <EmptyState
      mascot
      mascotPose="oops"
      icon={Home}
      title={t('common.notFoundTitle')}
      hint={t('common.notFoundHint')}
      action={{ label: t('common.notFoundHome'), onClick: () => navigate('/') }}
    />
  )
  if (!standalone) return <div className="rise-in">{body}</div>
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
      <div className="max-w-sm w-full rise-in">{body}</div>
    </div>
  )
}
