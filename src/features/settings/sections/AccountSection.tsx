import { Check } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { t } from '../../../i18n'
import { shortAccountCode } from '../../../lib/shortCode'

/** محتوى قسم «حسابي» — البريد + معرّف الحساب + الدور الحالي */
export function AccountSection({
  user,
  ownId,
  copied,
  copyMyId,
  role,
}: {
  user: { email?: string | null } | null
  ownId: string
  copied: boolean
  copyMyId: () => void
  role: string
}) {
  return (
    <>
      <div className="text-[13.5px] text-muted mb-1">{t('settings.emailLabel')}</div>
      <div className="font-semibold mb-3 break-all" dir="ltr" style={{ textAlign: 'start' }}>
        {user?.email ?? '—'}
      </div>
      <div className="text-[13.5px] text-muted mb-1">
        {t('settings.accountIdLabel')}
      </div>
      <div className="flex items-center gap-2 mb-1">
        {/* (ملاحظات المالك 2026-11-28): العرض هو الكود القصير المنظّم
            المشتق من المعرّف (lib/shortCode) بدل الـUUID الخام الطويل —
            المعرّف الكامل نفسه يفضل في الـtitle وزر النسخ بينسخه كما
            هو، لأن نموذج الإضافة بالمعرّف بيتحقق منه كاملاً */}
        <code
          className="flex-1 min-w-0 text-[13.5px] font-bold bg-soft rounded-xl px-2 py-2 leading-relaxed tracking-wide"
          dir="ltr"
          title={ownId}
        >
          {shortAccountCode(ownId)}
        </code>
        <Button variant="soft" onClick={copyMyId} className="min-h-[48px] px-3 text-[13.5px]">
          {copied ? (<><Check size={18} /> {t('settings.copied')}</>) : t('settings.copy')}
        </Button>
      </div>
      <div className="text-[13.5px] text-muted mt-2 mb-0">
        {t('settings.currentRoleLabel')}{' '}
        <b className="text-text">
          {role === 'owner' ? t('settings.roleOwner') : t('settings.roleAssistant')}
        </b>
      </div>
    </>
  )
}
