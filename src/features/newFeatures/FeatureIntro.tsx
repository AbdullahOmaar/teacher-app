import { Sparkles } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { t } from '../../i18n'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useNewFeatures } from './hooks'
import { featureById } from './registry'

/**
 * بطاقة تعريف الخاصية الجديدة — تظهر مرة واحدة أعلى صفحة الخاصية
 * عند أول فتح لها، وزرّها يختمها «شوهدت» فتختفي هي وشارتها نهائياً
 * لهذا المدرس (حالة خادمية لكل مدرس — 0073). الاستخدام: سطر واحد
 * أعلى أي صفحة خاصية مسجلة في registry.ts.
 * لا تُعرَض إطلاقاً حتى تُعرف حالة «شوهدت» (انظر hooks.ts) ولا
 * لخاصية غير مسجلة أو مختومة.
 */
export function FeatureIntro({ featureId }: { featureId: string }) {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const { isUnseen, markSeen } = useNewFeatures(teacherId)
  const def = featureById(featureId)
  if (!def || !teacherId || !isUnseen(featureId)) return null
  return (
    <Card className="mb-4 border-primary/30 bg-soft">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
          <Sparkles size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[12.5px] font-extrabold text-primary">
            {t('whatsNew.introKicker')}
          </p>
          <h2 className="m-0 mt-0.5 text-[16px] font-bold">{t(def.titleKey)}</h2>
          <p className="m-0 mt-1 text-[14px] leading-relaxed text-muted">{t(def.bodyKey)}</p>
          <div className="mt-3">
            <Button onClick={() => markSeen(featureId)}>{t('whatsNew.dismiss')}</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
