import { useState } from 'react'
import { formatDateTimeAr } from '../../lib/format'
import { copyText } from '../../lib/clipboard'
import { t } from '../../i18n'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/toast'
import { AlertTriangle, Check, Copy, Link2, MessageCircle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { StudentRow } from '../../types/database'
import {
  PORTAL_TOKEN_TTL_DAYS,
  effectiveGuardianFromStudent,
  portalLinkWaUrl,
  tokenStatus,
} from './api'
import {
  useCreatePortalLink,
  useGuardianIdForStudent,
  usePortalAccessSettings,
  useRevokePortalToken,
  useStudentPortalTokens,
  useUpdatePortalAccessSettings,
} from './hooks'
import { TokenRow } from './TokenRow'
import { LinkDurationField, PortalAccountBlock } from './accessUi'

interface PortalLinkSheetProps {
  teacherId: string
  student: StudentRow
  onClose: () => void
}

const STATUS_META: Record<ReturnType<typeof tokenStatus>, { label: string; cls: string }> = {
  active: { label: t('portal.sheetStatusActive'), cls: 'bg-ok/10 text-ok-text border-ok/30' },
  expired: { label: t('portal.sheetStatusExpired'), cls: 'bg-warn/15 text-warn-text border-warn/40' },
  revoked: { label: t('portal.sheetStatusRevoked'), cls: 'bg-bad/10 text-bad-text border-bad/30' },
}

/**
 * إدارة رابط بوابة ولي الأمر لطالب (الخطوة 9): توليد روابط (التوليد
 * إضافي — لا يُبطل أي رابط قائم؛ الإلغاء صريح لكل رابط من القائمة)،
 * نسخ، ومشاركة واتساب لولي الأمر.
 * الرمز الخام يعيش في حالة هذا المكوّن فقط بعد التوليد مباشرة —
 * القاعدة فيها الهاش بس، فالرابط القديم لا يمكن إعادة عرضه أبداً.
 */
export function PortalLinkSheet({ teacherId, student, onClose }: PortalLinkSheetProps) {
  const tokensQ = useStudentPortalTokens(teacherId, student.id)
  const createLink = useCreatePortalLink(teacherId)
  const revokeToken = useRevokePortalToken(teacherId)
  const settingsQ = usePortalAccessSettings(teacherId)
  const updateSettings = useUpdatePortalAccessSettings(teacherId)
  const guardianIdQ = useGuardianIdForStudent(teacherId, student.id)
  const toast = useToast()
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [freshDays, setFreshDays] = useState(PORTAL_TOKEN_TTL_DAYS)
  const [ttlChoice, setTtlChoice] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const guardian = effectiveGuardianFromStudent(student)
  const tokens = tokensQ.data ?? []
  const hasActive = tokens.some((t) => tokenStatus(t) === 'active')
  // مدة الرابط: اختيار الشيت الحالي، وإلا افتراضي المدرس المحفوظ (3A-385)
  const ttlDays = ttlChoice ?? settingsQ.data?.ttlDays ?? PORTAL_TOKEN_TTL_DAYS
  const waUrl = freshLink ? portalLinkWaUrl(student, freshLink, freshDays) : null

  const copyLink = async () => {
    if (!freshLink) return
    if (await copyText(freshLink)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      setCopied(false)
    }
  }

  return (
    <Sheet open title={t('portal.sheetTitle', { name: student.name })} onClose={onClose}>
      <p className="text-muted text-[13.5px] mt-0">
        {t('portal.sheetGuardianLabel')} <span className="font-semibold text-text">{guardian.name}</span>
        {guardian.phone ? (
          <>
            {' '}· <span dir="ltr">{guardian.phone}</span>
          </>
        ) : null}
        <br />
        {t('portal.sheetValidityNote', { days: ttlDays })}
      </p>

      <LinkDurationField value={ttlDays} onChange={setTtlChoice} />

      {!guardian.phone && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 text-[13.5px] p-3 mb-3 flex items-start gap-2">
          <AlertTriangle size={20} className="shrink-0 mt-0.5 text-warn-text" />
          <span>{t('portal.sheetNoPhoneWarning')}</span>
        </div>
      )}

      {freshLink && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 mb-3">
          <div className="font-bold text-[13.5px] mb-1.5 flex items-center gap-1.5"><Check size={18} className="text-ok-text" /> {t('portal.sheetFreshTitle')}</div>
          <div
            dir="ltr"
            className="text-left text-[12px] break-all bg-card border border-border rounded-xl p-2 select-all"
          >
            {freshLink}
          </div>
          <div className="flex gap-2 mt-2.5">
            <Button variant="soft" onClick={copyLink}>
              {copied ? (<><Check size={20} /> {t('portal.sheetCopied')}</>) : (<><Copy size={20} /> {t('portal.sheetCopyLink')}</>)}
            </Button>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer" className="no-underline">
                <Button>
                  <MessageCircle size={20} />
                  {t('portal.sheetSendWhatsapp')}
                </Button>
              </a>
            )}
          </div>
          <p className="text-muted text-[12px] mt-2 mb-0">
            {t('portal.sheetFreshNote')}
          </p>
        </div>
      )}

      <Button
        full
        disabled={!guardian.phone || createLink.isPending}
        onClick={() => {
          setCopied(false)
          createLink.mutate({ student, ttlDays }, {
            onSuccess: (res) => {
              setFreshLink(res.link)
              setFreshDays(ttlDays)
              // اختيار المدة يُحفظ افتراضياً للروابط الجاية (3A-385)
              if (settingsQ.data && settingsQ.data.ttlDays !== ttlDays) {
                updateSettings.mutate({ ...settingsQ.data, ttlDays })
              }
            },
          })
        }}
      >
        {createLink.isPending ? (
          t('portal.sheetGenerating')
        ) : hasActive ? (
          <>
            <RefreshCw size={20} />
            {t('portal.sheetRegenerateAction')}
          </>
        ) : (
          <>
            <Link2 size={20} />
            {t('portal.sheetGenerateAction')}
          </>
        )}
      </Button>
      {createLink.isError && (
        <p className="text-bad-text text-[13.5px] mt-2 mb-0">
          {createLink.error instanceof Error ? createLink.error.message : t('portal.sheetGenerateError')}
        </p>
      )}

      <h4 className="type-section mt-4 mb-2">{t('portal.sheetTokensTitle')}</h4>
      {tokensQ.isPending ? (
        <div className="text-muted text-[13.5px]">{t('portal.sheetLoadingTokens')}</div>
      ) : tokensQ.isError ? (
        <div className="text-bad-text text-[13.5px]">{t('portal.sheetTokensError')}</div>
      ) : tokens.length === 0 ? (
        <div className="text-muted text-[13.5px]">{t('portal.sheetNoTokens')}</div>
      ) : (
        tokens.map((tok) => {
          const meta = STATUS_META[tokenStatus(tok)]
          return (
            <TokenRow
              key={tok.id}
              token={tok}
              revoking={revokeToken.isPending}
              texts={{
                statusLabel: meta.label,
                statusCls: meta.cls,
                createdLine: t('portal.sheetCreatedLine', { created: formatDateTimeAr(tok.created_at), expires: formatDateTimeAr(tok.expires_at) }),
                lastUsedLine: t('portal.sheetLastUsed', { value: tok.last_used_at ? formatDateTimeAr(tok.last_used_at) : t('portal.sheetNeverOpened') }),
                revokedLine: (date) => t('portal.sheetRevokedLine', { date }),
                revokeConfirm: t('portal.sheetRevokeConfirm'),
                revokeAction: t('portal.sheetRevokeAction'),
              }}
              onRevoke={() =>
                revokeToken.mutate(tok.id, {
                  onError: () => toast(t('portal.sheetRevokeErrorToast'), 'error'),
                })
              }
            />
          )
        })
      )}

      <PortalAccountBlock
        teacherId={teacherId}
        role="guardian"
        targetId={guardianIdQ.data ?? null}
        usernameHint={guardian.phone}
        phone={guardian.phone}
        portalPath="/portal"
      />
    </Sheet>
  )
}
