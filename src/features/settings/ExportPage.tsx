import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Banknote, Calculator, CalendarCheck2, DatabaseBackup, FileDown, FileSpreadsheet, FileUp, Lock, NotebookPen, ReceiptText, Users, type LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextArea } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { CSV_KINDS, type CsvKind } from './api'
import { useExportCsv, useQuickImportStudents } from './hooks'

/**
 * تصدير واستيراد (المواصفات §3.14 + §5.8) — الخطوة 10:
 * • تصدير CSV للجداول الستة (الخمسة في المرجع + الطلاب) كملفات تُنزَّل
 *   فعلياً من المتصفح بترميز UTF-8 BOM حتى تفتح سليمة في Excel العربي،
 *   وكل تنزيل ناجح يحدّث teacher_settings.last_export_at (عقد تنبيه
 *   النسخ الاحتياطي في الرئيسية/الإشعارات).
 * • استيراد طلاب سريع من نص «الاسم, الموبايل, المجموعة» لكل سطر.
 * • النسخة الاحتياطية JSON الكاملة واستيرادها في شاشة /backup.
 * الشاشة للمالك فقط بنمط قفل شاشة الفلوس: جداول التصدير تشمل المالية
 * (فواتير/دفعات/مصروفات) المحجوبة عن المساعد في RLS نفسها.
 */
const KIND_ICONS: Record<CsvKind, LucideIcon> = {
  students: Users,
  invoices: ReceiptText,
  payments: Banknote,
  attendance: CalendarCheck2,
  scores: NotebookPen,
  expenses: Calculator,
}

export function ExportPage() {
  const teacher = useCurrentTeacher()
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''

  const exportCsv = useExportCsv(teacherId)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [lastKind, setLastKind] = useState<{ kind: CsvKind; label: string } | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)

  const [importText, setImportText] = useState('')
  const quickImport = useQuickImportStudents(teacherId)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!exportMsg && !importMsg) return
    const t = setTimeout(() => {
      setExportMsg(null)
      setImportMsg(null)
    }, 6000)
    return () => clearTimeout(t)
  }, [exportMsg, importMsg])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  if (!isOwner) {
    return (
      <Card className="text-center py-10">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div className="type-section mb-1">التصدير والاستيراد للمالك فقط</div>
        <p className="text-muted text-[13.5px] mb-0">
          الجداول المُصدَّرة تشمل بيانات مالية (فواتير ودفعات ومصروفات) محجوبة عن حساب المساعد في
          قاعدة البيانات نفسها (RLS) وليس في الواجهة فقط.
        </p>
      </Card>
    )
  }

  const handleExport = (kind: CsvKind, label: string) => {
    setLastKind({ kind, label })
    setExportMsg(null)
    setExportErr(null)
    exportCsv.mutate(kind, {
      onSuccess: (file) =>
        setExportMsg(`تم تنزيل «${label}» — ${file.rowCount} صف (${file.filename})`),
      onError: (err) =>
        setExportErr(err instanceof Error ? err.message : 'تعذّر إنشاء ملف التصدير.'),
    })
  }

  const handleQuickImport = () => {
    setImportMsg(null)
    quickImport.mutate(importText, {
      onSuccess: (res) => {
        const parts = [`تمت إضافة ${res.created} طالب`]
        if (res.enrolled > 0) parts.push(`وتسجيل ${res.enrolled} منهم في مجموعات`)
        if (res.skippedLines > 0) parts.push(`وتخطّي ${res.skippedLines} سطر بلا اسم`)
        if (res.errors.length > 0) parts.push(`وتعذّر ${res.errors.length} سطر`)
        setImportMsg(parts.join('، '))
        if (res.created > 0) setImportText('')
      },
    })
  }

  const pendingKind = exportCsv.isPending ? exportCsv.variables : undefined

  return (
    <div>
      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileUp size={22} className="text-primary" /> تصدير CSV</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          كل جدول بينزل كملف CSV جاهز لـ Excel أو Google Sheets (بترميز عربي سليم). المبالغ أرقام
          خام تقدر تحسب عليها، وتاريخ اليوم بيتحط في اسم الملف.
        </p>
        {exportMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{exportMsg}</p>
        )}
        {exportErr && (
          <div className="mb-3">
            <ErrorState
              message={exportErr}
              onRetry={
                lastKind ? () => handleExport(lastKind.kind, lastKind.label) : undefined
              }
            />
          </div>
        )}
        {CSV_KINDS.map((item) => (
          <div
            key={item.kind}
            className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
          >
            <span className="w-10 h-10 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
              {(() => {
                const KindIcon = KIND_ICONS[item.kind]
                return <KindIcon size={24} />
              })()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[15px]">{item.label}</span>
              <span className="block text-muted text-[12px]">{item.hint}</span>
            </span>
            <Button
              variant="soft"
              className="min-h-[48px] px-3 text-[13.5px] shrink-0"
              disabled={exportCsv.isPending}
              onClick={() => handleExport(item.kind, item.label)}
            >
              {pendingKind === item.kind ? 'جارٍ التجهيز…' : 'تنزيل'}
            </Button>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileDown size={22} className="text-primary" /> استيراد طلاب سريع</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          سطر لكل طالب بالصيغة: <b>الاسم, الموبايل, المجموعة</b> — الموبايل والمجموعة اختياريان.
          اسم المجموعة بيتمطابق بالاحتواء، ولو ما اتلقاش تطابق بيتحط الطالب في أول مجموعة. ولي
          الأمر بيتبني افتراضياً «ولي أمر + أول اسم»، وبقية البيانات تتكمل بعدين من ملف الطالب.
        </p>
        <Field label="قائمة الطلاب (سطر لكل طالب)">
          <TextArea
            rows={6}
            dir="auto"
            placeholder={'أحمد محمد, 01001234567, مجموعة السبت\nسارة علي, 01112223334'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </Field>
        {importMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{importMsg}</p>
        )}
        {quickImport.isError && (
          <FormError
            message={quickImport.error instanceof Error ? quickImport.error.message : 'تعذّر الاستيراد.'}
          />
        )}
        {quickImport.data && quickImport.data.errors.length > 0 && (
          <div className="text-[12px] text-bad-text bg-bad/5 rounded-xl px-3 py-2 mb-3">
            {quickImport.data.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <Button
          full
          onClick={handleQuickImport}
          disabled={quickImport.isPending || !importText.trim()}
        >
          {quickImport.isPending ? 'جارٍ الاستيراد…' : '+ إضافة الطلاب دفعة واحدة'}
        </Button>
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><FileSpreadsheet size={22} className="text-primary" /> استيراد طلاب من ملف Excel / CSV</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          المسار الكامل للملفات: قالب جاهز بنفس أعمدة تصدير الطلاب، معاينة قبل الحفظ بحالة كل
          صف، كشف تكرار بالموبايل والكود، وتسجيل اختياري في مجموعة. الاستيراد النصي فوق ده
          للّصق السريع البسيط، واستيراد الملف من شاشة الطلاب — نفس مسارات إنشاء الطالب في
          الحالتين.
        </p>
        <Link to="/students?import=1">
          <Button full variant="soft">
            فتح استيراد الملف من شاشة الطلاب
          </Button>
        </Link>
      </Card>

      <Card>
        <h2 className="type-section mt-0 mb-1 flex items-center gap-2"><DatabaseBackup size={22} className="text-primary" /> النسخة الاحتياطية الكاملة</h2>
        <p className="text-muted text-[13.5px] mt-0 mb-3">
          نسخة JSON فيها كل بياناتك (طلاب ومجموعات وفواتير وحضور ودرجات…) تقدر تحفظها وترجع
          تستوردها في أي وقت — من شاشة النسخ الاحتياطي.
        </p>
        <Link to="/backup">
          <Button full variant="soft">
            الذهاب للنسخ الاحتياطي والاستعادة
          </Button>
        </Link>
      </Card>
    </div>
  )
}
