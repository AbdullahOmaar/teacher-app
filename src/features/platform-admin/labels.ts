import { t } from '../../i18n'
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  type FeatureKey,
  type LimitKey,
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
  }
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

/** اسم عرض أي مفتاح تجاوز (خاصية أو حد) — المجهول يرجع كما هو */
export function overrideKeyLabel(kind: 'feature' | 'limit', key: string): string {
  if (kind === 'feature') {
    return (FEATURE_KEYS as readonly string[]).includes(key)
      ? featureKeyLabel(key as FeatureKey)
      : key
  }
  return (LIMIT_KEYS as readonly string[]).includes(key)
    ? limitKeyLabel(key as LimitKey)
    : key
}
