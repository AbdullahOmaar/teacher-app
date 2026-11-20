import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'

const QUICK_ACTIONS = [
  { icon: '➕', label: 'طالب جديد' },
  { icon: '💵', label: 'تسجيل دفعة' },
  { icon: '🧾', label: 'تسجيل مصروف' },
  { icon: '⭐', label: 'حصة إضافية' },
]

/** الرئيسية — Hero الحصة القادمة + إجراءات سريعة + KPIs (المرجع §3.1/§6.5) */
export function HomePage() {
  return (
    <div>
      {/* Hero: بطاقة الحصة القادمة بتدرّج نيلي */}
      <div className="rounded-2xl p-4 mb-3 text-white bg-[linear-gradient(135deg,#4F46E5,#4338CA)] shadow-[0_8px_20px_rgba(79,70,229,0.35)]">
        <div className="text-[13px] opacity-85 mb-1">الحصة القادمة</div>
        <div className="font-extrabold text-[17px]">هتظهر هنا بعد ربط البيانات</div>
        <div className="text-[13px] opacity-85 mt-1">لسه مفيش حصص مجدولة النهاردة.</div>
      </div>

      {/* شبكة الإجراءات السريعة */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            className="bg-card border border-border rounded-2xl py-3 flex flex-col items-center gap-1 cursor-pointer text-text"
          >
            <span className="text-[20px]">{a.icon}</span>
            <span className="text-[11px] font-semibold">{a.label}</span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { value: '—', label: 'نسبة حضور الشهر' },
          { value: '—', label: 'محصّل الشهر' },
          { value: '—', label: 'فواتير غير مسددة' },
        ].map((kpi) => (
          <Card key={kpi.label} className="mb-0 text-center">
            <b className="block text-[21px] font-extrabold leading-tight">{kpi.value}</b>
            <span className="text-muted text-[12px] font-semibold">{kpi.label}</span>
          </Card>
        ))}
      </div>

      <Card>
        <EmptyState icon="📅" title="حصص اليوم" hint="هتظهر حصص اليوم وحالتها هنا بعد إنشاء المجموعات." />
      </Card>
    </div>
  )
}
