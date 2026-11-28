import type { I18nKey } from '../../i18n'

// ============================================================================
// نظام «جديد» العام (توجيه المالك ٥ — المهمة 24 / 3A-900، مهاجرة 0073)
// ----------------------------------------------------------------------------
// سجل الخصائص الجديدة: كل خاصية تدخل التطبيق تُسجَّل هنا بسطر واحد —
// معرّف ثابت + أول إصدار ظهرت فيه + مسار دخولها الرئيسي + مفتاحا نص
// بطاقة التعريف. الآلة العامة (شارة عند المداخل + بطاقة تعريف مرة
// واحدة عند أول فتح + حالة «شوهدت» لكل مدرس في teacher_feature_seen)
// تعمل فوق هذا السجل وحده: إضافة خاصية مستقبلاً = سطر هنا + مكوّن
// ‏<FeatureIntro> أعلى صفحتها، بلا أي تغيير في الآلة.
// المعيار موثّق للشركة في docs/PHASE2-T24-AUTO-NOTIFY.md §3 لتعميمه
// على باقي التطبيقات بنفس الشكل (سجل + حالة خادمية + شارة + بطاقة).
// ============================================================================

export interface NewFeatureDef {
  /** معرّف ثابت لا يتغير أبداً بعد النشر (مفتاح حالة «شوهدت») */
  id: string
  /** أول إصدار ظهرت فيه الخاصية — توثيقي، من سجل الإصدارات */
  sinceVersion: string
  /** مسار الدخول الرئيسي — الشارة تظهر على مداخله */
  path: string
  titleKey: I18nKey
  bodyKey: I18nKey
}

/** خصائص إصدار 2.0 (فيز 2) — البذرة الأولى للسجل */
export const NEW_FEATURES: readonly NewFeatureDef[] = [
  {
    id: 'assistant-deterministic',
    sinceVersion: '2.0',
    path: '/assistant',
    titleKey: 'whatsNew.assistantTitle',
    bodyKey: 'whatsNew.assistantBody',
  },
  {
    id: 'platform-announcements',
    sinceVersion: '2.0',
    path: '/announcements',
    titleKey: 'whatsNew.announcementsTitle',
    bodyKey: 'whatsNew.announcementsBody',
  },
  {
    id: 'support-tickets',
    sinceVersion: '2.0',
    path: '/support',
    titleKey: 'whatsNew.supportTitle',
    bodyKey: 'whatsNew.supportBody',
  },
  {
    id: 'teacher-feedback',
    sinceVersion: '2.0',
    path: '/feedback',
    titleKey: 'whatsNew.feedbackTitle',
    bodyKey: 'whatsNew.feedbackBody',
  },
]

export function featureById(id: string): NewFeatureDef | undefined {
  return NEW_FEATURES.find((f) => f.id === id)
}

/** الخاصية المسجلة لمسار دخول معيّن (مطابقة تامة للمسار الأساسي) */
export function featureForPath(path: string): NewFeatureDef | undefined {
  const base = path.split('?')[0]
  return NEW_FEATURES.find((f) => f.path === base)
}

/** الخصائص التي لم تُشاهَد بعد من قائمة «شوهدت» معروفة */
export function unseenFeatures(seenIds: ReadonlySet<string>): NewFeatureDef[] {
  return NEW_FEATURES.filter((f) => !seenIds.has(f.id))
}
