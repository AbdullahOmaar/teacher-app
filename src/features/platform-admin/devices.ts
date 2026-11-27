import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import type { Json } from '../../types/database'
import { isMissingRpcFunction } from '../auth/api'
import { sha256Hex } from '../portal/api'

// ---------------------------------------------------------------------------
// تنبيهات الأجهزة الجديدة لأدمن المنصة (مهمة 23 — 0068): هوية الجهاز
// ببصمة SHA-256 لوكيل المستخدم المُطَبَّع + تسجيل الجهاز عند دخول
// /admin + شريط تنبيه + قسم «الأجهزة» في اللوحة.
// • بلا IP إطلاقاً (يتغير — انظر الوثيقة)؛ وبلا سلسلة وكيل خام في
//   القاعدة (هاش فقط — نمط التوكنات: hash-only).
// • كل RPC يتحمّل غيابه قبل تطبيق 0068 (يرجع null → القسم «قريباً»
//   والشريط مخفي)؛ أي خطأ آخر يصعد للواجهة كحالة خطأ مصممة.
// • التدقيق عبر log_platform_audit() (0066) بنمط best-effort مثل 2FA:
//   غيابه قبل 0066 لا يكسر أي مسار.
// ---------------------------------------------------------------------------

/** جهاز أدمن كما يرجع من list_platform_devices() */
export interface AdminDevice {
  id: string
  deviceHash: string
  label: string
  trusted: boolean
  firstSeenAt: string
  lastSeenAt: string
}

/** أفعال تدقيق الأجهزة — نص حر في platform_audit_log (بلا enum مقيّد) */
export type DeviceAuditAction =
  | 'device_new'
  | 'device_trusted'
  | 'device_revoked'

/** متصفح معروف للعرض — غيره «غير معروف» */
export type DeviceBrowser =
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'edge'
  | 'chromium'
  | 'unknown'

/** نظام تشغيل معروف للعرض — غيره «غير معروف» */
export type DeviceOs =
  | 'windows'
  | 'macos'
  | 'ios'
  | 'android'
  | 'linux'
  | 'chromeos'
  | 'unknown'

/** مدخل بصمة الجهاز — وكيل المستخدم + بياناته المنظمة إن توفرت */
export interface DeviceIdentityInput {
  userAgent: string
  brands?: ReadonlyArray<{ brand: string; version: string }> | null
  platform?: string | null
}

/** هوية الجهاز النقية: البصمة المُطَبَّعة + المتصفح + النظام */
export interface DeviceIdentity {
  /** السلسلة المُطَبَّعة التي تُحسب بصمتها (بلا أرقام إصدارات) */
  normalized: string
  browser: DeviceBrowser
  os: DeviceOs
}

/** علامة «ليست علامة تجارية» في userAgentData.brands — دهون خصوصية تُستبعد */
function isNotBrand(brand: string): boolean {
  return brand.trim().toLowerCase().startsWith('not')
}

/**
 * تطبيع وكيل المستخدم إلى سلسلة مستقرة عبر تحديثات المتصفح الروتينية:
 * • ببيانات منظمة (userAgentData.brands): أسماء العلامات فقط (بلا
 *   إصدارات)، مرتبة ومفصولة بـ '|' — تحديث كروم 120 ← 121 لا يغيّرها.
 * • بلا بيانات منظمة: تقسيم السلسلة الخام إلى رموز وحذف أي رمز يحمل
 *   رقماً (أرقام إصدارات وبنايات مثل 15E148 و17_2 تسقط كلها)، مع
 *   إزالة التكرار مع حفظ الترتيب — تحديث iOS أو رقم بناء لا يغيّرها.
 * سلسلة فارغة تسقط إلى 'unknown' حتى تبقى البصمة محسوبة دائماً.
 */
export function normalizeUserAgent(
  userAgent: string,
  brands?: ReadonlyArray<{ brand: string; version: string }> | null,
): string {
  if (brands && brands.length > 0) {
    const names = [...new Set(
      brands
        .map((b) => (typeof b.brand === 'string' ? b.brand.trim().toLowerCase() : ''))
        .filter((n) => n !== '' && !isNotBrand(n)),
    )].sort()
    if (names.length > 0) return names.join('|')
  }
  const tokens = (userAgent ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok !== '' && !/\d/.test(tok))
  const deduped = [...new Set(tokens)]
  return deduped.length > 0 ? deduped.join(' ') : 'unknown'
}

function detectBrowser(normalized: string): DeviceBrowser {
  const s = normalized.toLowerCase()
  if (s.includes('edg') || s.includes('edge')) return 'edge'
  if (s.includes('firefox')) return 'firefox'
  if (s.includes('chrome')) return 'chrome'
  if (s.includes('safari')) return 'safari'
  if (s.includes('chromium')) return 'chromium'
  return 'unknown'
}

function detectOsFromPlatform(platform: string | null | undefined): DeviceOs | null {
  const p = (platform ?? '').trim().toLowerCase()
  if (p === '') return null
  if (p.includes('windows')) return 'windows'
  if (p.includes('mac')) return 'macos'
  if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return 'ios'
  if (p.includes('android')) return 'android'
  if (p.includes('chrome os') || p === 'chromeos') return 'chromeos'
  if (p.includes('linux')) return 'linux'
  return null
}

function detectOsFromTokens(normalized: string): DeviceOs {
  const s = normalized.toLowerCase()
  if (s.includes('iphone') || s.includes('ipad')) return 'ios'
  if (s.includes('android')) return 'android'
  if (s.includes('windows')) return 'windows'
  if (s.includes('cros')) return 'chromeos'
  if (s.includes('mac')) return 'macos'
  if (s.includes('linux')) return 'linux'
  return 'unknown'
}

/**
 * هوية الجهاز النقية من وكيل المستخدم: البصمة المُطَبَّعة + المتصفح
 * + النظام. النظام من userAgentData.platform عند توفره (أدق — العلامات
 * لا تحمل نظاماً)، وإلا من رموز السلسلة الخام.
 */
export function buildDeviceIdentity(input: DeviceIdentityInput): DeviceIdentity {
  const normalized = normalizeUserAgent(input.userAgent, input.brands)
  const browser = detectBrowser(normalized)
  const os =
    detectOsFromPlatform(input.platform) ?? detectOsFromTokens(normalized)
  return { normalized, browser, os }
}

/** التسمية المخزنة للجهاز — رمزان إنجليزيان ثابتان (العرض يترجمهما) */
export function deviceLabelFor(identity: DeviceIdentity): string {
  return `${identity.browser} / ${identity.os}`
}

/** ترجمة التسمية المخزنة للعرض — رمز مجهول يظهر خاماً كما هو */
export function deviceLabelText(label: string): string {
  const parts = label.split(' / ')
  if (parts.length !== 2) return label
  const [browser, os] = parts
  const browserText =
    browser === 'chrome'
      ? t('platformAdmin.deviceBrowserChrome')
      : browser === 'firefox'
        ? t('platformAdmin.deviceBrowserFirefox')
        : browser === 'safari'
          ? t('platformAdmin.deviceBrowserSafari')
          : browser === 'edge'
            ? t('platformAdmin.deviceBrowserEdge')
            : browser === 'chromium'
              ? t('platformAdmin.deviceBrowserChromium')
              : browser
  const osText =
    os === 'windows'
      ? t('platformAdmin.deviceOsWindows')
      : os === 'macos'
        ? t('platformAdmin.deviceOsMacos')
        : os === 'ios'
          ? t('platformAdmin.deviceOsIos')
          : os === 'android'
            ? t('platformAdmin.deviceOsAndroid')
            : os === 'linux'
              ? t('platformAdmin.deviceOsLinux')
              : os === 'chromeos'
                ? t('platformAdmin.deviceOsChromeos')
                : os
  return `${browserText} — ${osText}`
}

/** هل يوجد جهاز غير موثوق في القائمة؟ (قرار الشريط — نقي) */
export function hasUntrustedDevice(
  devices: AdminDevice[] | null,
): boolean {
  return (devices ?? []).some((d) => !d.trusted)
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    brands?: ReadonlyArray<{ brand: string; version: string }>
    platform?: string
  }
}

/**
 * هوية الجهاز الحالي من المتصفح: بصمة SHA-256 للسلسلة المُطَبَّعة +
 * التسمية. غياب navigator (بيئة بلا متصفح) يرجع null — لا بصمة
 * مخترعة ولا كسر للوحة.
 */
export async function currentDeviceIdentity(): Promise<{
  hash: string
  label: string
} | null> {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as NavigatorWithUserAgentData
  const identity = buildDeviceIdentity({
    userAgent:
      typeof nav.userAgent === 'string' ? nav.userAgent : '',
    brands: nav.userAgentData?.brands ?? null,
    platform: nav.userAgentData?.platform ?? null,
  })
  const hash = await sha256Hex(identity.normalized)
  return { hash, label: deviceLabelFor(identity) }
}

/** تحويل حمولة list_platform_devices الخام — أي صف مشوّه يسقط */
export function parseAdminDevices(data: unknown): AdminDevice[] {
  if (!Array.isArray(data)) return []
  const out: AdminDevice[] = []
  for (const item of data) {
    const row = (item ?? {}) as Record<string, unknown>
    if (
      typeof row.id !== 'string' ||
      typeof row.device_hash !== 'string' ||
      typeof row.label !== 'string' ||
      typeof row.trusted !== 'boolean' ||
      typeof row.first_seen_at !== 'string' ||
      typeof row.last_seen_at !== 'string'
    ) {
      continue
    }
    out.push({
      id: row.id,
      deviceHash: row.device_hash,
      label: row.label,
      trusted: row.trusted,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    })
  }
  return out
}

/** نتيجة تسجيل الجهاز — isNew صحيح عند أول ظهور فقط */
export interface RegisterDeviceResult {
  isNew: boolean
  deviceId: string
}

/**
 * تسجيل الجهاز الحالي عبر register_platform_device() — يرجع null عند
 * غياب الدالة (0068 لم تُطبَّق بعد)؛ أي خطأ آخر يُرمى.
 */
export async function registerCurrentDevice(input: {
  hash: string
  label: string
}): Promise<RegisterDeviceResult | null> {
  const { data, error } = await db().rpc('register_platform_device', {
    p_device_hash: input.hash,
    p_label: input.label,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null
  if (
    !row ||
    typeof row.is_new !== 'boolean' ||
    typeof row.device_id !== 'string'
  ) {
    throw new Error(t('platformAdmin.deviceRegisterError'))
  }
  return { isNew: row.is_new, deviceId: row.device_id }
}

/** قائمة أجهزة الأدمن الحالي — null عند غياب 0068 (قسم «قريباً») */
export async function fetchAdminDevices(): Promise<AdminDevice[] | null> {
  const { data, error } = await db().rpc('list_platform_devices')
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseAdminDevices(data)
}

/** توثيق جهاز — يرجع true عند التوثيق، وfalse عند غيابه/رفضه */
export async function trustAdminDevice(deviceId: string): Promise<boolean> {
  const { data, error } = await db().rpc('trust_platform_device', {
    p_device_id: deviceId,
  })
  if (error) throw error
  return data === true
}

/** إلغاء جهاز — يرجع true عند الحذف، وfalse عند غيابه/رفضه */
export async function revokeAdminDevice(
  deviceId: string,
): Promise<boolean> {
  const { data, error } = await db().rpc('revoke_platform_device', {
    p_device_id: deviceId,
  })
  if (error) throw error
  return data === true
}

/**
 * تدقيق الأجهزة عبر log_platform_audit() (0066) — best-effort عمداً:
 * الدالة غائبة حتى تطبيق 0066 عند بوابة التجميد، والتدقيق لا يجوز
 * أن يكسر مساراً ناجحاً أصلاً. الفشل يُبتلع بمصير موثق هنا (لا إعادة
 * رمي ولا رسالة للمستخدم)؛ نتيجة الفعل نفسها هي مصدر الحقيقة.
 */
export async function logDeviceAudit(
  action: DeviceAuditAction,
  details?: Record<string, Json>,
): Promise<void> {
  try {
    const { error } = await db().rpc('log_platform_audit', {
      p_action: action,
      p_target_teacher_id: null,
      p_details: details ?? {},
    })
    if (error) throw error
  } catch {
    // مقصود: التدقيق best-effort حتى 0066 — انظر التعليق أعلاه.
  }
}

/**
 * ضمان تسجيل الجهاز الحالي عند دخول /admin: بصمة + تسجيل + تدقيق
 * `device_new` عند أول ظهور. يرجع null عندما يتعذّر التسجيل
 * (بلا متصفح أو 0068 غائبة) — اللوحة تكمل بلا شريط وبلا كسر.
 */
export async function ensureCurrentDevice(): Promise<{
  isNew: boolean
} | null> {
  const current = await currentDeviceIdentity()
  if (!current) return null
  const registered = await registerCurrentDevice(current)
  if (!registered) return null
  if (registered.isNew) {
    await logDeviceAudit('device_new', {
      device_label: current.label,
      device_hash_prefix: current.hash.slice(0, 8),
    })
  }
  return { isNew: registered.isNew }
}
