import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import {
  buildDeviceIdentity,
  currentDeviceIdentity,
  deviceLabelFor,
  deviceLabelText,
  ensureCurrentDevice,
  fetchAdminDevices,
  hasUntrustedDevice,
  logDeviceAudit,
  normalizeUserAgent,
  parseAdminDevices,
  registerCurrentDevice,
  revokeAdminDevice,
  trustAdminDevice,
  type AdminDevice,
} from './devices'

/**
 * اختبارات تنبيهات الأجهزة الجديدة لأدمن المنصة (مهمة 23 — 0068):
 * تطبيع وكيل المستخدم نقي ومستقر عبر التحديثات الروتينية، ونداءات
 * RPC تمرّر كما هي مع تحمّل غيابها قبل 0068، والتدقيق best-effort
 * لا يكسر أبداً. لا اتصال حي هنا إطلاقاً — db() موهوم بالكامل.
 */

const h = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args })
      return Promise.resolve(h.rpcResult)
    },
  }),
}))

vi.mock('../portal/api', () => ({
  sha256Hex: (text: string) =>
    Promise.resolve(`hash-${text.length}-${text.slice(0, 4)}`),
}))

function reset() {
  h.rpcResult = { data: null, error: null }
  h.rpcCalls = []
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CHROME_UA_121 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

function deviceRow(over: Partial<AdminDevice> = {}): AdminDevice {
  return {
    id: 'd-1',
    deviceHash: 'a'.repeat(64),
    label: 'chrome / windows',
    trusted: false,
    firstSeenAt: '2026-11-27T08:00:00Z',
    lastSeenAt: '2026-11-27T09:00:00Z',
    ...over,
  }
}

describe('normalizeUserAgent', () => {
  it('يفضّل علامات userAgentData: أسماء فقط بلا إصدارات ومرتبة', () => {
    expect(
      normalizeUserAgent(CHROME_UA, [
        { brand: 'Google Chrome', version: '120' },
        { brand: 'Chromium', version: '120' },
        { brand: 'Not-A.Brand', version: '99' },
      ]),
    ).toBe('chromium|google chrome')
  })

  it('يسقط علامة «Not» حتى لو كانت الوحيدة فيعود للسلسلة الخام', () => {
    const out = normalizeUserAgent(CHROME_UA, [
      { brand: 'Not-A.Brand', version: '99' },
    ])
    expect(out).not.toContain('not')
    expect(out).toContain('chrome')
  })

  it('يجعل تحديث كروم 120 ← 121 بلا أثر على البصمة المُطَبَّعة', () => {
    expect(normalizeUserAgent(CHROME_UA)).toBe(
      normalizeUserAgent(CHROME_UA_121),
    )
  })

  it('يحذف أرقام الإصدارات وبنايات iOS (15E148) من السلسلة', () => {
    const out = normalizeUserAgent(IPHONE_UA)
    expect(out).not.toMatch(/\d/)
    expect(out).toContain('iphone')
    expect(out).toContain('safari')
  })

  it('سلسلة فارغة تسقط إلى unknown لا إلى فراغ', () => {
    expect(normalizeUserAgent('')).toBe('unknown')
    expect(normalizeUserAgent('12345')).toBe('unknown')
  })

  it('يميز كروم عن فايرفوكس بعد التطبيع', () => {
    expect(normalizeUserAgent(CHROME_UA)).not.toBe(
      normalizeUserAgent(FIREFOX_UA),
    )
  })
})

describe('buildDeviceIdentity', () => {
  it('كروم ويندوز من السلسلة الخام', () => {
    const id = buildDeviceIdentity({ userAgent: CHROME_UA })
    expect(id.browser).toBe('chrome')
    expect(id.os).toBe('windows')
  })

  it('فايرفوكس ويندوز من السلسلة الخام', () => {
    const id = buildDeviceIdentity({ userAgent: FIREFOX_UA })
    expect(id.browser).toBe('firefox')
    expect(id.os).toBe('windows')
  })

  it('آيفون: سفاري + iOS', () => {
    const id = buildDeviceIdentity({ userAgent: IPHONE_UA })
    expect(id.browser).toBe('safari')
    expect(id.os).toBe('ios')
  })

  it('إيدج يُكتشف قبل كروم (سلسلته تحوي كروم أيضاً)', () => {
    const id = buildDeviceIdentity({ userAgent: EDGE_UA })
    expect(id.browser).toBe('edge')
  })

  it('المنصة من userAgentData.platform أدق من الرموز', () => {
    const id = buildDeviceIdentity({
      userAgent: CHROME_UA,
      brands: [
        { brand: 'Google Chrome', version: '120' },
        { brand: 'Chromium', version: '120' },
      ],
      platform: 'macOS',
    })
    expect(id.browser).toBe('chrome')
    expect(id.os).toBe('macos')
  })

  it('سلسلة غريبة: متصفح ونظام غير معروفين لا كسر', () => {
    const id = buildDeviceIdentity({ userAgent: 'SomeBot/1.0' })
    expect(id.browser).toBe('unknown')
    expect(id.os).toBe('unknown')
    expect(deviceLabelFor(id)).toBe('unknown / unknown')
  })
})

describe('deviceLabelText', () => {
  it('يترجم الرموز المعروفة للعربية من القاموس', () => {
    expect(deviceLabelText('chrome / windows')).toBe(
      `${t('platformAdmin.deviceBrowserChrome')} — ${t('platformAdmin.deviceOsWindows')}`,
    )
    expect(deviceLabelText('safari / ios')).toBe(
      `${t('platformAdmin.deviceBrowserSafari')} — ${t('platformAdmin.deviceOsIos')}`,
    )
  })

  it('رمز مجهول يظهر خاماً والتسمية المشوهة ترجع كما هي', () => {
    expect(deviceLabelText('unknown / unknown')).toBe('unknown — unknown')
    expect(deviceLabelText('not-a-label')).toBe('not-a-label')
  })
})

describe('hasUntrustedDevice', () => {
  it('null أو كلها موثوقة → لا شريط', () => {
    expect(hasUntrustedDevice(null)).toBe(false)
    expect(hasUntrustedDevice([deviceRow({ trusted: true })])).toBe(false)
  })

  it('جهاز واحد غير موثوق → شريط', () => {
    expect(
      hasUntrustedDevice([
        deviceRow({ trusted: true }),
        deviceRow({ id: 'd-2', trusted: false }),
      ]),
    ).toBe(true)
  })
})

describe('parseAdminDevices', () => {
  it('يحول الصفوف السليمة ويسقط المشوه منها', () => {
    expect(
      parseAdminDevices([
        {
          id: 'd-1',
          device_hash: 'a'.repeat(64),
          label: 'chrome / windows',
          trusted: false,
          first_seen_at: '2026-11-27T08:00:00Z',
          last_seen_at: '2026-11-27T09:00:00Z',
        },
        { id: 'd-2', label: 'x' },
        null,
      ]),
    ).toHaveLength(1)
  })

  it('غير مصفوفة → []', () => {
    expect(parseAdminDevices(null)).toEqual([])
    expect(parseAdminDevices({})).toEqual([])
  })
})

describe('RPC wrappers', () => {
  it('register: أول ظهور isNew=true والثاني isNew=false', async () => {
    reset()
    h.rpcResult = {
      data: [{ is_new: true, device_id: 'd-1' }],
      error: null,
    }
    await expect(
      registerCurrentDevice({ hash: 'a'.repeat(64), label: 'chrome / windows' }),
    ).resolves.toEqual({ isNew: true, deviceId: 'd-1' })
    expect(h.rpcCalls[0]).toEqual({
      name: 'register_platform_device',
      args: { p_device_hash: 'a'.repeat(64), p_label: 'chrome / windows' },
    })
    h.rpcResult = {
      data: [{ is_new: false, device_id: 'd-1' }],
      error: null,
    }
    await expect(
      registerCurrentDevice({ hash: 'a'.repeat(64), label: 'chrome / windows' }),
    ).resolves.toEqual({ isNew: false, deviceId: 'd-1' })
  })

  it('register: غياب الدالة (PGRST202) يرجع null لا رمياً', async () => {
    reset()
    h.rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'does not exist' },
    }
    await expect(
      registerCurrentDevice({ hash: 'a'.repeat(64), label: 'x' }),
    ).resolves.toBeNull()
  })

  it('register: حمولة مشوهة أو خطأ آخر يُرمى', async () => {
    reset()
    h.rpcResult = { data: [{ is_new: 'yes' }], error: null }
    await expect(
      registerCurrentDevice({ hash: 'a'.repeat(64), label: 'x' }),
    ).rejects.toThrow()
    h.rpcResult = { data: null, error: { message: 'boom' } }
    await expect(
      registerCurrentDevice({ hash: 'a'.repeat(64), label: 'x' }),
    ).rejects.toThrow('boom')
  })

  it('fetch: قائمة سليمة، وغياب الدالة → null', async () => {
    reset()
    // حمولة RPC تستخدم snake_case كما ترد فعلياً
    h.rpcResult = {
      data: [
        {
          id: 'd-1',
          device_hash: 'a'.repeat(64),
          label: 'chrome / windows',
          trusted: false,
          first_seen_at: '2026-11-27T08:00:00Z',
          last_seen_at: '2026-11-27T09:00:00Z',
        },
      ],
      error: null,
    }
    await expect(fetchAdminDevices()).resolves.toEqual([deviceRow()])
    h.rpcResult = {
      data: null,
      error: { code: '42883', message: 'does not exist' },
    }
    await expect(fetchAdminDevices()).resolves.toBeNull()
  })

  it('trust/revoke: true تعني نجاحاً، وnull تعني غياباً/رفضاً', async () => {
    reset()
    h.rpcResult = { data: true, error: null }
    await expect(trustAdminDevice('d-1')).resolves.toBe(true)
    await expect(revokeAdminDevice('d-1')).resolves.toBe(true)
    h.rpcResult = { data: null, error: null }
    await expect(trustAdminDevice('d-1')).resolves.toBe(false)
    await expect(revokeAdminDevice('d-1')).resolves.toBe(false)
    expect(h.rpcCalls.map((c) => c.name)).toEqual([
      'trust_platform_device',
      'revoke_platform_device',
      'trust_platform_device',
      'revoke_platform_device',
    ])
  })

  it('logDeviceAudit لا يرمي أبداً حتى مع خطأ RPC', async () => {
    reset()
    h.rpcResult = { data: null, error: { message: 'boom' } }
    await expect(
      logDeviceAudit('device_new', { device_label: 'x' }),
    ).resolves.toBeUndefined()
    expect(h.rpcCalls[0].name).toBe('log_platform_audit')
  })
})

describe('ensureCurrentDevice', () => {
  it('يسجل الجهاز الحالي ويدقق device_new عند أول ظهور', async () => {
    reset()
    vi.stubGlobal('navigator', { userAgent: CHROME_UA })
    h.rpcResult = {
      data: [{ is_new: true, device_id: 'd-1' }],
      error: null,
    }
    // النداء الأول تسجيل، والثاني تدقيق
    const calls = h.rpcCalls
    await expect(ensureCurrentDevice()).resolves.toEqual({ isNew: true })
    expect(calls[0].name).toBe('register_platform_device')
    expect(calls[1].name).toBe('log_platform_audit')
    expect(
      (calls[1].args as { p_action: string }).p_action,
    ).toBe('device_new')
    vi.unstubAllGlobals()
  })

  it('جهاز معروف: بلا تدقيق device_new', async () => {
    reset()
    vi.stubGlobal('navigator', { userAgent: CHROME_UA })
    h.rpcResult = {
      data: [{ is_new: false, device_id: 'd-1' }],
      error: null,
    }
    await expect(ensureCurrentDevice()).resolves.toEqual({ isNew: false })
    expect(h.rpcCalls).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('بلا navigator أو RPC غائبة → null بلا كسر', async () => {
    reset()
    vi.stubGlobal('navigator', undefined)
    await expect(ensureCurrentDevice()).resolves.toBeNull()
    vi.unstubAllGlobals()
    vi.stubGlobal('navigator', { userAgent: CHROME_UA })
    h.rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'does not exist' },
    }
    await expect(ensureCurrentDevice()).resolves.toBeNull()
    vi.unstubAllGlobals()
  })

  it('currentDeviceIdentity: بلا navigator → null', async () => {
    vi.stubGlobal('navigator', undefined)
    await expect(currentDeviceIdentity()).resolves.toBeNull()
    vi.unstubAllGlobals()
  })
})
