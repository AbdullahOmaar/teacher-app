import { Lock } from 'lucide-react'
import { Card } from './Card'

/**
 * بطاقة «لا صلاحية» — نمط شاشة المالية (MoneyPage): قفل + عنوان + شرح.
 * تُعرض بدل حالة الفراغ المضللة عندما يحجب RLS البيانات عن المساعد
 * فعلاً (بلا أي صلاحية تشغيلية — 0079)، لا عندما تكون القائمة فارغة
 * فعلاً. الفرق مقصود: «لسه مفيش طلاب» تعني القائمة فارغة، وهذه تعني
 * «محجوب عنك» — خلطهما هو ما دفع المساعد لإضافة طلاب مكررين.
 */
export function PermissionDeniedCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center py-10">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Lock size={28} />
      </div>
      <div className="type-section mb-1">{title}</div>
      <p className="text-muted text-[13.5px] mb-0">{body}</p>
    </Card>
  )
}
