import { Check } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { t } from '../../../i18n'

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
        <code className="flex-1 min-w-0 text-[12px] bg-soft rounded-xl px-2 py-2 break-all leading-relaxed" dir="ltr">
          {ownId}
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
