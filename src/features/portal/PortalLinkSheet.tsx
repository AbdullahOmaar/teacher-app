import { useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import type { GuardianAccessTokenRow, StudentRow } from '../../types/database'
import {
  PORTAL_TOKEN_TTL_DAYS,
  effectiveGuardianFromStudent,
  portalLinkWaUrl,
  tokenStatus,
} from './api'
import { useCreatePortalLink, useRevokePortalToken, useStudentPortalTokens } from './hooks'

interface PortalLinkSheetProps {
  teacherId: string
  student: StudentRow
  onClose: () => void
}

const STATUS_META: Record<ReturnType<typeof tokenStatus>, { label: string; cls: string }> = {
  active: { label: 'نشط', cls: 'bg-ok/10 text-ok-text border-ok/30' },
  expired: { label: 'منتهي', cls: 'bg-warn/15 text-warn-text border-warn/40' },
  revoked: { label: 'ملغي', cls: 'bg-bad/10 text-bad-text border-bad/30' },
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: GuardianAccessTokenRow
  onRevoke: () => void
  revoking: boolean
}) {
  const status = tokenStatus(token)
  const meta = STATUS_META[status]
  return (
    <div className="border border-border rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] font-bold border rounded-full px-2.5 py-0.5 ${meta.cls}`}>
          {meta.label}
        </span>
        {status === 'active' && (
          <button
            type="button"
            disabled={revoking}
            onClick={() => {
              if (window.confirm('إلغاء الرابط ده؟ ولي الأمر مش هيقدر يفتح البوابة بيه تاني.'))
                onRevoke()
            }}
            className="text-bad-text text-[12.5px] font-semibold bg-transparent border-0 cursor-pointer disabled:opacity-50"
          >
            إلغاء الرابط
          </button>
        )}
      </div>
      <div className="text-muted text-[12.5px] mt-1.5 leading-relaxed">
        اتعمل: {fmtDateTime(token.created_at)} · بيخلص: {fmtDateTime(token.expires_at)}
        <br />
        آخر استخدام: {token.last_used_at ? fmtDateTime(token.last_used_at) : 'لسه ما اتفتحش'}
        {token.revoked_at ? (
          <>
            <br />
            اتلغى: {fmtDateTime(token.revoked_at)}
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * إدارة رابط بوابة ولي الأمر لطالب (الخطوة 9): توليد/إعادة توليد
 * (إعادة التوليد تُبطل النشط قبله)، نسخ، ومشاركة واتساب لولي الأمر.
 * الرمز الخام يعيش في حالة هذا المكوّن فقط بعد التوليد مباشرة —
 * القاعدة فيها الهاش بس، فالرابط القديم لا يمكن إعادة عرضه أبداً.
 */
export function PortalLinkSheet({ teacherId, student, onClose }: PortalLinkSheetProps) {
  const tokensQ = useStudentPortalTokens(teacherId, student.id)
  const createLink = useCreatePortalLink(teacherId)
  const revokeToken = useRevokePortalToken(teacherId)
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const guardian = effectiveGuardianFromStudent(student)
  const tokens = tokensQ.data ?? []
  const hasActive = tokens.some((t) => tokenStatus(t) === 'active')
  const waUrl = freshLink ? portalLinkWaUrl(student, freshLink) : null

  const copyLink = async () => {
    if (!freshLink) return
    try {
      await navigator.clipboard.writeText(freshLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Sheet open title={`رابط بوابة ولي الأمر — ${student.name}`} onClose={onClose}>
      <p className="text-muted text-[13px] mt-0">
        ولي الأمر: <span className="font-semibold text-text">{guardian.name}</span>
        {guardian.phone ? (
          <>
            {' '}· <span dir="ltr">{guardian.phone}</span>
          </>
        ) : null}
        <br />
        الرابط صالح {PORTAL_TOKEN_TTL_DAYS} يوم وبيعرض الحضور والدرجات والموقف المالي بس (قراءة فقط).
      </p>

      {!guardian.phone && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 text-[13px] p-3 mb-3">
          ⚠️ الطالب مالوش رقم موبايل (لا لولي الأمر ولا للطالب نفسه) — ضيف رقم من «تعديل الطالب»
          الأول علشان نقدر نعمل ولي أمر ونبعتله الرابط.
        </div>
      )}

      {freshLink && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 mb-3">
          <div className="font-bold text-[13.5px] mb-1.5">✅ الرابط الجديد جاهز — بيظهر هنا مرة واحدة بس</div>
          <div
            dir="ltr"
            className="text-left text-[11.5px] break-all bg-card border border-border rounded-lg p-2 select-all"
          >
            {freshLink}
          </div>
          <div className="flex gap-2 mt-2.5">
            <Button variant="soft" onClick={copyLink}>
              {copied ? '✅ اتنسخ' : '📋 نسخ الرابط'}
            </Button>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer" className="no-underline">
                <Button>💬 إرسال واتساب</Button>
              </a>
            )}
          </div>
          <p className="text-muted text-[12px] mt-2 mb-0">
            لو ضاع الرابط ده مش هنقدر نعرضه تاني (القاعدة فيها بصمته بس) — ولّد واحد جديد وخلاص،
            والقديم بيتلغي تلقائياً.
          </p>
        </div>
      )}

      <Button
        full
        disabled={!guardian.phone || createLink.isPending}
        onClick={() => {
          setCopied(false)
          createLink.mutate(student, {
            onSuccess: (res) => setFreshLink(res.link),
          })
        }}
      >
        {createLink.isPending
          ? 'بنولّد الرابط…'
          : hasActive
            ? '🔄 إعادة توليد رابط جديد (يبطل القديم)'
            : '🔗 توليد رابط ولي الأمر'}
      </Button>
      {createLink.isError && (
        <p className="text-bad-text text-[13px] mt-2 mb-0">
          {createLink.error instanceof Error ? createLink.error.message : 'حصلت مشكلة في توليد الرابط'}
        </p>
      )}

      <h4 className="text-[14px] font-bold mt-4 mb-2">روابط الطالب</h4>
      {tokensQ.isPending ? (
        <div className="text-muted text-[13px]">بنحمّل الروابط…</div>
      ) : tokensQ.isError ? (
        <div className="text-bad-text text-[13px]">ماقدرناش نحمّل الروابط</div>
      ) : tokens.length === 0 ? (
        <div className="text-muted text-[13px]">مفيش روابط معمولة للطالب ده لسه.</div>
      ) : (
        tokens.map((t) => (
          <TokenRow
            key={t.id}
            token={t}
            revoking={revokeToken.isPending}
            onRevoke={() => revokeToken.mutate(t.id)}
          />
        ))
      )}
    </Sheet>
  )
}
