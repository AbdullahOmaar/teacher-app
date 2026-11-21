import { useState } from 'react'
import { formatDateTimeAr } from '../../lib/format'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/toast'
import { Check, Copy, GraduationCap, Link2, MessageCircle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { StudentAccessTokenRow, StudentRow } from '../../types/database'
import {
  STUDENT_PORTAL_TOKEN_TTL_DAYS,
  studentPortalLinkWaUrl,
  studentTokenStatus,
} from './api'
import {
  useCreateStudentPortalLink,
  useRevokeStudentPortalToken,
  useStudentPortalTokens,
} from './hooks'
import { t } from '../../i18n'

interface StudentPortalLinkSheetProps {
  teacherId: string
  student: StudentRow
  onClose: () => void
}

const STATUS_META: Record<ReturnType<typeof studentTokenStatus>, { label: string; cls: string }> = {
  active: { label: t('studentPortal.linkStatusActive'), cls: 'bg-ok/10 text-ok-text border-ok/30' },
  expired: { label: t('studentPortal.linkStatusExpired'), cls: 'bg-warn/15 text-warn-text border-warn/40' },
  revoked: { label: t('studentPortal.linkStatusRevoked'), cls: 'bg-bad/10 text-bad-text border-bad/30' },
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: StudentAccessTokenRow
  onRevoke: () => void
  revoking: boolean
}) {
  const status = studentTokenStatus(token)
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
              if (window.confirm(t('studentPortal.linkRevokeConfirm')))
                onRevoke()
            }}
            className="text-bad-text text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer disabled:opacity-50"
          >
            {t('studentPortal.linkRevokeAction')}
          </button>
        )}
      </div>
      <div className="text-muted text-[13.5px] mt-1.5 leading-relaxed">
        {t('studentPortal.linkCreatedLine', { created: formatDateTimeAr(token.created_at), expires: formatDateTimeAr(token.expires_at) })}
        <br />
        {t('studentPortal.linkLastUsedLine', { lastUsed: token.last_used_at ? formatDateTimeAr(token.last_used_at) : t('studentPortal.linkNeverUsed') })}
        {token.revoked_at ? (
          <>
            <br />
            {t('studentPortal.linkRevokedLine', { date: formatDateTimeAr(token.revoked_at) })}
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * إدارة رابط بوابة الطالب (Phase 3 خطوة 5): توليد/إعادة توليد (إعادة
 * التوليد تُبطل النشط قبله)، نسخ، ومشاركة واتساب للطالب نفسه (أو ولي
 * أمره إن لم يوجد رقم للطالب). الرابط مستقل تماماً عن رابط ولي الأمر
 * ورابط الامتحان — إلغاء أيٍّ منهم لا يمسّ الباقي. الرمز الخام يعيش في
 * حالة هذا المكوّن فقط بعد التوليد مباشرة — القاعدة فيها الهاش بس،
 * فالرابط القديم لا يمكن إعادة عرضه أبداً.
 */
export function StudentPortalLinkSheet({
  teacherId,
  student,
  onClose,
}: StudentPortalLinkSheetProps) {
  const tokensQ = useStudentPortalTokens(teacherId, student.id)
  const createLink = useCreateStudentPortalLink(teacherId)
  const revokeToken = useRevokeStudentPortalToken(teacherId)
  const toast = useToast()
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const tokens = tokensQ.data ?? []
  const hasActive = tokens.some((t) => studentTokenStatus(t) === 'active')
  const waUrl = freshLink ? studentPortalLinkWaUrl(student, freshLink) : null

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
    <Sheet open title={t('studentPortal.linkSheetTitle', { name: student.name })} onClose={onClose}>
      <p className="text-muted text-[13.5px] mt-0">
        {t('studentPortal.linkIntro', { days: STUDENT_PORTAL_TOKEN_TTL_DAYS })}
      </p>

      {freshLink && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 mb-3">
          <div className="font-bold text-[13.5px] mb-1.5 flex items-center gap-1.5">
            <Check size={18} className="text-ok-text" /> {t('studentPortal.linkFreshTitle')}
          </div>
          <div
            dir="ltr"
            className="text-left text-[12px] break-all bg-card border border-border rounded-xl p-2 select-all"
          >
            {freshLink}
          </div>
          <div className="flex gap-2 mt-2.5">
            <Button variant="soft" onClick={copyLink}>
              {copied ? (
                <>
                  <Check size={20} /> {t('studentPortal.linkCopied')}
                </>
              ) : (
                <>
                  <Copy size={20} /> {t('studentPortal.linkCopy')}
                </>
              )}
            </Button>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer" className="no-underline">
                <Button>
                  <MessageCircle size={20} />
                  {t('studentPortal.linkSendWa')}
                </Button>
              </a>
            )}
          </div>
          <p className="text-muted text-[12px] mt-2 mb-0">
            {t('studentPortal.linkLostNote')}
          </p>
        </div>
      )}

      <Button
        full
        disabled={createLink.isPending}
        onClick={() => {
          setCopied(false)
          createLink.mutate(student, {
            onSuccess: (res) => setFreshLink(res.link),
          })
        }}
      >
        {createLink.isPending ? (
          t('studentPortal.linkGenerating')
        ) : hasActive ? (
          <>
            <RefreshCw size={20} />
            {t('studentPortal.linkRegenerate')}
          </>
        ) : (
          <>
            <Link2 size={20} />
            {t('studentPortal.linkGenerate')}
          </>
        )}
      </Button>
      {createLink.isError && (
        <p className="text-bad-text text-[13.5px] mt-2 mb-0">
          {createLink.error instanceof Error
            ? createLink.error.message
            : t('studentPortal.linkGenerateError')}
        </p>
      )}

      <h4 className="type-section mt-4 mb-2 flex items-center gap-2">
        <GraduationCap size={20} className="text-primary" /> {t('studentPortal.linkListTitle')}
      </h4>
      {tokensQ.isPending ? (
        <div className="text-muted text-[13.5px]">{t('studentPortal.linkLoading')}</div>
      ) : tokensQ.isError ? (
        <div className="text-bad-text text-[13.5px]">{t('studentPortal.linkLoadError')}</div>
      ) : tokens.length === 0 ? (
        <div className="text-muted text-[13.5px]">{t('studentPortal.linkEmpty')}</div>
      ) : (
        tokens.map((tok) => (
          <TokenRow
            key={tok.id}
            token={tok}
            revoking={revokeToken.isPending}
            onRevoke={() =>
              revokeToken.mutate(tok.id, {
                onError: () => toast(t('studentPortal.linkRevokeErrorToast'), 'error'),
              })
            }
          />
        ))
      )}
    </Sheet>
  )
}
