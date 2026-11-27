import { t } from '../../i18n'
import {
  CONFIRMATION_CHANNELS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  SETTING_KEYS,
  type ConfirmationChannel,
  type FeatureKey,
  type LimitKey,
  type SettingKey,
} from './entitlements'

/**
 * أسماء عرض مفاتيح الباقات/الخصائص/الحدود في لوحة الأدمن — مفاتيح
 * i18n حرفية في كل فرع (لا بناء ديناميكي لأسماء المفاتيح أبداً).
 */

export function planLabel(slug: string | null): string {
  switch (slug) {
    case 'basic':
      return t('platformAdmin.planBasic')
    case 'pro':
      return t('platformAdmin.planPro')
    case 'pilot':
      return t('platformAdmin.planPilot')
    case 'trial':
      return t('platformAdmin.planTrial')
    default:
      return t('platformAdmin.noPlan')
  }
}

export function featureKeyLabel(key: FeatureKey): string {
  switch (key) {
    case 'whatsapp_auto':
      return t('platformAdmin.featureWhatsappAuto')
    case 'ai_assistant':
      return t('platformAdmin.featureAiAssistant')
    case 'team_accounts':
      return t('platformAdmin.featureTeamAccounts')
    case 'online_payments':
      return t('platformAdmin.featureOnlinePayments')
    case 'verification_required':
      return t('platformAdmin.featureVerificationRequired')
    case 'verification_channel_email':
      return t('platformAdmin.featureVerificationChannelEmail')
    case 'verification_channel_whatsapp':
      return t('platformAdmin.featureVerificationChannelWhatsapp')
    case 'verification_channel_sms':
      return t('platformAdmin.featureVerificationChannelSms')
    case 'confirmation_required':
      return t('platformAdmin.featureConfirmationRequired')
  }
}

/** اسم عرض مفتاح إعداد (0063 — النوع 'setting') */
export function settingKeyLabel(key: SettingKey): string {
  switch (key) {
    case 'confirmation_channel':
      return t('platformAdmin.settingConfirmationChannel')
  }
}

/** اسم عرض قناة التأكيد الواحدة (تصحيح المالك 17:19) */
export function confirmationChannelLabel(channel: ConfirmationChannel): string {
  switch (channel) {
    case 'mobile':
      return t('platformAdmin.confirmationChannelMobile')
    case 'whatsapp':
      return t('platformAdmin.confirmationChannelWhatsapp')
    case 'email':
      return t('platformAdmin.confirmationChannelEmail')
  }
}

/** هل القيمة قناة تأكيد صالحة؟ */
export function isConfirmationChannelValue(
  value: string,
): value is ConfirmationChannel {
  return (CONFIRMATION_CHANNELS as readonly string[]).includes(value)
}

export function limitKeyLabel(key: LimitKey): string {
  switch (key) {
    case 'max_students':
      return t('platformAdmin.limitMaxStudents')
    case 'max_messages_month':
      return t('platformAdmin.limitMaxMessagesMonth')
    case 'max_storage_mb':
      return t('platformAdmin.limitMaxStorageMb')
    case 'max_team_members':
      return t('platformAdmin.limitMaxTeamMembers')
    case 'max_ai_messages_month':
      return t('platformAdmin.limitMaxAiMessagesMonth')
  }
}

/** اسم عرض أي مفتاح تجاوز (خاصية أو حد أو إعداد) — المجهول يرجع كما هو */
export function overrideKeyLabel(
  kind: 'feature' | 'limit' | 'setting',
  key: string,
): string {
  if (kind === 'feature') {
    return (FEATURE_KEYS as readonly string[]).includes(key)
      ? featureKeyLabel(key as FeatureKey)
      : key
  }
  if (kind === 'setting') {
    return (SETTING_KEYS as readonly string[]).includes(key)
      ? settingKeyLabel(key as SettingKey)
      : key
  }
  return (LIMIT_KEYS as readonly string[]).includes(key)
    ? limitKeyLabel(key as LimitKey)
    : key
}
