import { BellRing, Copy, LogIn, LogOut } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import type { RosterStudent } from '../api'
import { t } from '../../../i18n'

/** صف واحد في قائمة إرسال واتساب وصل/غادر — يُبنى في الصفحة من القائمة وجهات الاتصال */
export interface WaSendRow {
  student: RosterStudent
  guardianName: string
  arrivalUrl: string | null
  departureUrl: string | null
  arrivalText: string | null
  departureText: string | null
}

/**
 * قائمة إرسال واتساب وصل/غادر (خطوة 6): روابط wa.me فردية
 * بنص موحّد للحاضرين والمنصرفين — إرسال يدوي بالكامل:
 * لا إرسال تلقائي ولا Push خارجي في هذه المرحلة، والتنبيه
 * داخل بوابة ولي الأمر يتولد تلقائياً في القاعدة أصلاً.
 */
export function WaSendCard({
  rows,
  onCopyAll,
}: {
  rows: WaSendRow[]
  onCopyAll: () => void
}) {
  return (
    <Card>
      {/* flex-wrap + زر بلا التفاف (3A-324): العنوان والزر
          لا يتسع لهما صفّ واحد في العروض الضيقة فكان نص
          الزر يلتف سطرين ويتشوّه — الآن ينزل الزر سليماً
          لسطر مستقل عند الضيق ويبقى بجانب العنوان عند الاتساع */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="font-bold text-[15px] flex items-center gap-2 min-w-0">
          <BellRing size={20} className="text-primary shrink-0" />
          {t('attendance.waTitle')}
        </div>
        <Button
          variant="ghost"
          className="min-h-[48px] text-[13.5px] px-3 shrink-0 whitespace-nowrap"
          onClick={onCopyAll}
        >
          <Copy size={16} />
          {t('attendance.copyAllMessages')}
        </Button>
      </div>
      <p className="text-muted text-[13.5px] mt-0">
        {t('attendance.waHint')}
      </p>
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div
            key={r.student.id}
            className={`py-2.5 flex items-center gap-2 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            {/* بطاقة تفاعلية (3A-384 — ملاحظة المالك ٢-ز):
                اسم الطالب وتحته اسم ولي الأمر، وأزرار
                الإرسال في الطرف المقابل لهما */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] truncate">{r.student.name}</div>
              <div className="text-muted text-[13.5px] truncate">
                {t('attendance.guardianLabel', { name: r.guardianName })}
              </div>
              {!r.arrivalUrl && r.arrivalText && (
                <div className="text-muted text-[12px]">
                  {t('attendance.noPhoneArrived')}
                </div>
              )}
              {!r.departureUrl && r.departureText && (
                <div className="text-muted text-[12px]">
                  {t('attendance.noPhoneLeft')}
                </div>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {r.arrivalUrl && (
                <a href={r.arrivalUrl} target="_blank" rel="noreferrer" className="no-underline">
                  <Button variant="soft" size="sm">
                    <LogIn size={16} />
                    {t('attendance.sendArrived')}
                  </Button>
                </a>
              )}
              {r.departureUrl && (
                <a href={r.departureUrl} target="_blank" rel="noreferrer" className="no-underline">
                  <Button variant="soft" size="sm">
                    <LogOut size={16} />
                    {t('attendance.sendLeft')}
                  </Button>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
