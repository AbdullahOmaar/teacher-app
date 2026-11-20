import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Sheet } from '../../components/ui/Sheet'
import { Printer } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/brand/Logo'
import { darken } from '../../lib/brand'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import type { StudentRow } from '../../types/database'

interface StudentCardSheetProps {
  student: StudentRow
  groupNames: string[]
  onClose: () => void
}

/**
 * الكارت الرقمي للطالب (المواصفات §4 مودال idCard):
 * بطاقة بتدرّج نيلي أعمق (#312E81)، الاسم والكود والصف والمجموعات،
 * و QR **حقيقي قابل للمسح** مولّد من كود الطالب (public_code) —
 * بديل الـ QR الوهمي في النسخة المرجعية (تحذير §7.1).
 */
export function StudentCardSheet({ student, groupNames, onClose }: StudentCardSheetProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  // الهوية البيضاء (Phase 3 خطوة 1): شعار/اسم/لهجة السنتر إن وُجدت، وإلا
  // التدرج النيلي وشعار التطبيق واسم المدرس كما كانوا قبلها بالضبط.
  const { brand } = useBrandIdentity(student.teacher_id)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(student.public_code, { width: 220, margin: 1 })
      .then((url) => {
        if (alive) setQrUrl(url)
      })
      .catch(() => {
        if (alive) setQrUrl(null)
      })
    return () => {
      alive = false
    }
  }, [student.public_code])

  return (
    <Sheet open title="الكارت الرقمي" onClose={onClose}>
      <div
        className="rounded-2xl p-5 text-white mb-4"
        style={{
          background: brand.accent
            ? `linear-gradient(135deg, ${darken(brand.accent, 0.45)}, ${brand.accent})`
            : 'linear-gradient(135deg, #312e81, #4338ca)',
          boxShadow: '0 10px 24px rgba(49,46,129,0.35)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name ?? 'شعار السنتر'}
                  className="w-[38px] h-[38px] rounded-lg object-contain bg-white p-0.5 shrink-0"
                />
              ) : (
                <Logo mono size={30} />
              )}
              <span className="text-[12px] opacity-80">
                {brand.name ? `${brand.name} · كارت طالب` : 'كارت طالب'}
              </span>
            </div>
            <div className="text-[19px] font-extrabold leading-[1.7]">{student.name}</div>
            <div className="text-[13.5px] opacity-90 mt-1">
              الكود: <span dir="ltr" className="font-bold">{student.public_code}</span>
              {student.grade ? ` · ${student.grade}` : ''}
            </div>
            {student.school && <div className="text-[13.5px] opacity-80">{student.school}</div>}
          </div>
          <div className="bg-white rounded-xl p-1.5 shrink-0">
            {qrUrl ? (
              <img src={qrUrl} alt={`QR كود الطالب ${student.public_code}`} className="w-[104px] h-[104px] block" />
            ) : (
              <div className="w-[104px] h-[104px] flex items-center justify-center text-slate-500 text-[12px]">
                بنجهّز الكود…
              </div>
            )}
          </div>
        </div>
        <div className="text-[13.5px] opacity-90 mt-3 border-t border-white/25 pt-2">
          المجموعات: {groupNames.length ? groupNames.join('، ') : '—'}
        </div>
      </div>
      <div className="flex gap-2">
        <Button full onClick={() => window.print()}>
          <Printer size={20} />
          طباعة الكارت
        </Button>
        <Button variant="ghost" onClick={onClose}>
          إغلاق
        </Button>
      </div>
    </Sheet>
  )
}
