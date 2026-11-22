import { formatDateTimeAr } from '../../lib/format'
import type { TokenRowLike } from './tokenLifecycle'
import { tokenStatusOf } from './tokenLifecycle'

// ===========================================================================
// صف رابط توكن مشترك بين شيتَي بوابة ولي الأمر وبوابة الطالب (COD-3 /
// 3A-362). البنية والتنسيق متطابقان بايتاً في الشيتين؛ الفروق هي نصوص
// i18n فقط (مفاتيح مختلفة لكل بوابة) فتصل هنا كنصوص جاهزة من المستدعي —
// لا مفتاح i18n واحد يتغير ولا سلوك يتغير.
// ===========================================================================

export interface TokenRowTexts {
  statusLabel: string
  statusCls: string
  /** سطر «أُنشئ … · ينتهي …» جاهزاً بمفاتيح البوابة المستدعية */
  createdLine: string
  /** سطر «آخر فتح …» جاهزاً (يشمل بديل «لم يُفتح بعد») */
  lastUsedLine: string
  /** سطر «أُلغي في …» جاهزاً — يُبنى فقط عند وجود revoked_at */
  revokedLine: (date: string) => string
  revokeConfirm: string
  revokeAction: string
}

export function TokenRow({
  token,
  texts,
  onRevoke,
  revoking,
}: {
  token: TokenRowLike & { created_at: string; expires_at: string; last_used_at: string | null; revoked_at: string | null }
  texts: TokenRowTexts
  onRevoke: () => void
  revoking: boolean
}) {
  const status = tokenStatusOf(token)
  return (
    <div className="border border-border rounded-xl p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] font-bold border rounded-full px-2.5 py-0.5 ${texts.statusCls}`}>
          {texts.statusLabel}
        </span>
        {status === 'active' && (
          <button
            type="button"
            disabled={revoking}
            onClick={() => {
              if (window.confirm(texts.revokeConfirm)) onRevoke()
            }}
            className="text-bad-text text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer disabled:opacity-50"
          >
            {texts.revokeAction}
          </button>
        )}
      </div>
      <div className="text-muted text-[13.5px] mt-1.5 leading-relaxed">
        {texts.createdLine}
        <br />
        {texts.lastUsedLine}
        {token.revoked_at ? (
          <>
            <br />
            {texts.revokedLine(formatDateTimeAr(token.revoked_at))}
          </>
        ) : null}
      </div>
    </div>
  )
}
