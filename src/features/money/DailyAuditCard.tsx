import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { t } from '../../i18n'
import { todayStr } from '../home/api'
import {
  runDailyAudit,
  summarizeDailyAudit,
  type DailyAuditData,
  type DailyAuditIssue,
} from './dailyAudit'

function issueLabel(issue: DailyAuditIssue, data: DailyAuditData): string {
  switch (issue) {
    case 'day-open':
      return t('money.dailyAuditDayOpen')
    case 'cashbox-diff':
      return t('money.dailyAuditCashboxDiff')
    case 'pending-proofs':
      return t('money.dailyAuditPendingProofs', { count: data.pendingProofs })
    case 'failed-notifications':
      return t('money.dailyAuditFailedNotifications', { count: data.failedNotifications })
  }
}

/**
 * بطاقة «تدقيق اليوم» أعلى صفحة المال (مهمة 11 — بند 4): زر واحد
 * يشغّل فحصاً قرائياً من أربع نقاط على بيانات اليوم ويعرض تقريراً
 * من سطر واحد — تمامٌ صريح أو قائمة القضايا المفتوحة بعدّاداتها.
 * الفحص لا ينفّذ أي إجراء: الإغلاق والاعتماد وإعادة الإرسال خطوات
 * مقصودة بيد المدرس (docs/TWO-STEP-FOREVER.md).
 */
export function DailyAuditCard({ teacherId }: { teacherId: string }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ data: DailyAuditData; issues: DailyAuditIssue[] } | null>(
    null,
  )
  const [failed, setFailed] = useState(false)

  const onRun = async () => {
    setRunning(true)
    setFailed(false)
    try {
      const data = await runDailyAudit(teacherId, todayStr())
      setResult({ data, issues: summarizeDailyAudit(data) })
    } catch {
      // مصير واضح: رسالة خطأ صريحة مكان النتيجة — لا تقرير وهمي
      setResult(null)
      setFailed(true)
    } finally {
      setRunning(false)
    }
  }

  const line = result
    ? result.issues.length === 0
      ? t('money.dailyAuditOk')
      : t('money.dailyAuditIssuesPrefix') +
        result.issues.map((issue) => issueLabel(issue, result.data)).join(' · ')
    : null

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
          <ClipboardCheck size={22} />
        </span>
        <div className="flex-1">
          <h2 className="text-[15px] font-bold mt-0 mb-0.5">{t('money.dailyAuditTitle')}</h2>
          <p className="text-muted text-[12.5px] leading-[1.7] mt-0 mb-0">
            {t('money.dailyAuditHint')}
          </p>
        </div>
        <Button size="sm" onClick={onRun} disabled={running}>
          {running ? t('money.dailyAuditRunning') : t('money.dailyAuditRun')}
        </Button>
      </div>
      {line ? (
        <p
          className={`rounded-xl px-3 py-2 text-[13.5px] leading-[1.8] font-semibold mt-3 mb-0 ${
            result && result.issues.length === 0
              ? 'bg-ok-soft text-ok-text'
              : 'bg-warn/15 text-warn-text'
          }`}
        >
          {line}
        </p>
      ) : null}
      {failed ? (
        <p className="bg-bad-soft text-bad-text rounded-xl px-3 py-2 text-[13.5px] leading-[1.8] font-semibold mt-3 mb-0">
          {t('money.dailyAuditError')}
        </p>
      ) : null}
    </Card>
  )
}
