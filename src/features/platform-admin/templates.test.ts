import { describe, expect, it, vi } from 'vitest'
import {
  applyRoleTemplate,
  buildTemplateEntitlements,
  createRoleTemplate,
  fetchRoleTemplates,
  isTemplateEntitlementsEmpty,
  parseRoleTemplate,
  updateRoleTemplate,
} from './templates'

/**
 * اختبارات قوالب الأدوار الجاهزة (مهمة 18 — 0063): بناء حمولة
 * القالب الخالصة + محلّل الصف الآمن + عقد طبقة العميل مع RPCs
 * الثلاثة وقراءة الجدول المباشرة — لا قيم مخترعة عند غياب
 * المهاجرة (null فيُعرض «قريباً»).
 */

const h = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  tableResult: { data: null as unknown, error: null as unknown },
  tableCalls: [] as Array<{ table: string; columns: string }>,
}))

vi.mock('../../lib/supabase', () => ({
  db: () => ({
    rpc: (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args })
      return Promise.resolve(h.rpcResult)
    },
    from: (table: string) => ({
      select: (columns: string) => {
        h.tableCalls.push({ table, columns })
        return {
          order: () => Promise.resolve(h.tableResult),
        }
      },
    }),
  }),
}))

function setRpc(data: unknown, error: unknown = null) {
  h.rpcResult = { data, error }
  h.rpcCalls = []
}

function setTable(data: unknown, error: unknown = null) {
  h.tableResult = { data, error }
  h.tableCalls = []
}

const FULL_ENTITLEMENTS = {
  features: { whatsapp_auto: true, confirmation_required: true },
  limits: { max_students: 200, max_messages_month: null },
  settings: { confirmation_channel: 'whatsapp' },
}

describe('buildTemplateEntitlements — بناء حمولة نظيفة', () => {
  it('يحتفظ بالإدخالات الصالحة (خاصية + حد + قناة + حد بلا حد)', () => {
    expect(buildTemplateEntitlements(FULL_ENTITLEMENTS)).toEqual({
      features: { whatsapp_auto: true, confirmation_required: true },
      limits: { max_students: 200, max_messages_month: null },
      settings: { confirmation_channel: 'whatsapp' },
    })
  })

  it('يُسقط المفاتيح الغريبة والقيم المشوّهة بصمت', () => {
    expect(
      buildTemplateEntitlements({
        features: { whatsapp_auto: 'yes' as never, not_a_key: true },
        limits: {
          max_students: -3,
          max_team_members: 2.5,
          max_storage_mb: 1024,
        },
        settings: { confirmation_channel: 'pigeon', other: 'mobile' },
      }),
    ).toEqual({
      features: {},
      limits: { max_storage_mb: 1024 },
      settings: {},
    })
  })

  it('isTemplateEntitlementsEmpty: فارغة فقط عند غياب كل الأقسام', () => {
    expect(
      isTemplateEntitlementsEmpty({ features: {}, limits: {}, settings: {} }),
    ).toBe(true)
    expect(isTemplateEntitlementsEmpty(FULL_ENTITLEMENTS)).toBe(false)
    expect(
      isTemplateEntitlementsEmpty({
        features: {},
        limits: {},
        settings: { confirmation_channel: 'email' },
      }),
    ).toBe(false)
  })
})

describe('parseRoleTemplate — تحويل آمن لصف القالب', () => {
  it('يحوّل صفاً كاملاً', () => {
    expect(
      parseRoleTemplate({
        id: 'tpl-1',
        slug: 'pilot-plus',
        name: 'باقة الطيار الموسّعة',
        description: 'للمدرس الأول',
        entitlements: FULL_ENTITLEMENTS,
        is_active: true,
        created_at: '2026-11-26T10:00:00Z',
        updated_at: '2026-11-26T10:00:00Z',
      }),
    ).toEqual({
      id: 'tpl-1',
      slug: 'pilot-plus',
      name: 'باقة الطيار الموسّعة',
      description: 'للمدرس الأول',
      entitlements: FULL_ENTITLEMENTS,
      isActive: true,
      createdAt: '2026-11-26T10:00:00Z',
      updatedAt: '2026-11-26T10:00:00Z',
    })
  })

  it('null عند slug مخالف للنمط أو اسم فارغ أو حمولة مشوّهة', () => {
    expect(parseRoleTemplate({ id: 'x', slug: 'Bad Slug!', name: 'n' })).toBeNull()
    expect(parseRoleTemplate({ id: 'x', slug: 'ok-slug', name: '  ' })).toBeNull()
    expect(parseRoleTemplate(null)).toBeNull()
    expect(
      parseRoleTemplate({
        id: 'x',
        slug: 'ok-slug',
        name: 'n',
        entitlements: 'garbage',
        is_active: true,
      }),
    ).toEqual({
      id: 'x',
      slug: 'ok-slug',
      name: 'n',
      description: '',
      entitlements: { features: {}, limits: {}, settings: {} },
      isActive: true,
      createdAt: '',
      updatedAt: '',
    })
  })
})

describe('fetchRoleTemplates — عقد قراءة الجدول', () => {
  it('يرجع القوالب المحلّلة ويتخطى المشوّه', async () => {
    setTable([
      {
        id: 'tpl-1',
        slug: 'pilot-plus',
        name: 'باقة الطيار',
        description: '',
        entitlements: FULL_ENTITLEMENTS,
        is_active: true,
        created_at: '2026-11-26T10:00:00Z',
        updated_at: '2026-11-26T10:00:00Z',
      },
      { id: 'bad', slug: 'BAD!', name: 'x' },
    ])
    const out = await fetchRoleTemplates()
    expect(out).toHaveLength(1)
    expect(out?.[0].slug).toBe('pilot-plus')
    expect(h.tableCalls[0].table).toBe('role_templates')
  })

  it('الجدول الغائب قبل 0063 → null (قسم «قريباً»)', async () => {
    setTable(null, { code: '42P01', message: 'relation does not exist' })
    await expect(fetchRoleTemplates()).resolves.toBeNull()
  })

  it('خطأ آخر يصعد ولا يُبتلع', async () => {
    setTable(null, { code: '42501', message: 'not authorized' })
    await expect(fetchRoleTemplates()).rejects.toMatchObject({
      message: 'not authorized',
    })
  })
})

describe('createRoleTemplate / updateRoleTemplate — عقد RPCs', () => {
  it('الإنشاء يستدعي RPC بالحمولة ويرجع المعرّف', async () => {
    setRpc('tpl-new-id')
    const id = await createRoleTemplate({
      slug: 'pilot-plus',
      name: 'باقة الطيار',
      description: '',
      entitlements: FULL_ENTITLEMENTS,
    })
    expect(id).toBe('tpl-new-id')
    expect(h.rpcCalls).toEqual([
      {
        name: 'create_role_template',
        args: {
          p_slug: 'pilot-plus',
          p_name: 'باقة الطيار',
          p_description: '',
          p_entitlements: FULL_ENTITLEMENTS,
        },
      },
    ])
  })

  it('معرّف فارغ من الخادم يُرفض بدل تمريره صامتاً', async () => {
    setRpc('')
    await expect(
      createRoleTemplate({
        slug: 'x',
        name: 'n',
        description: '',
        entitlements: FULL_ENTITLEMENTS,
      }),
    ).rejects.toThrow()
  })

  it('التعديل يستدعي RPC بكل الحقول بما فيها التفعيل', async () => {
    setRpc('tpl-1')
    const id = await updateRoleTemplate({
      templateId: 'tpl-1',
      name: 'اسم جديد',
      description: 'وصف',
      entitlements: FULL_ENTITLEMENTS,
      isActive: false,
    })
    expect(id).toBe('tpl-1')
    expect(h.rpcCalls[0]).toEqual({
      name: 'update_role_template',
      args: {
        p_template_id: 'tpl-1',
        p_name: 'اسم جديد',
        p_description: 'وصف',
        p_entitlements: FULL_ENTITLEMENTS,
        p_is_active: false,
      },
    })
  })
})

describe('applyRoleTemplate — عقد التطبيق', () => {
  it('يرجع معرّفات التجاوزات المكتوبة', async () => {
    setRpc(['ov-1', 'ov-2'])
    const ids = await applyRoleTemplate({
      templateId: 'tpl-1',
      teacherId: 't-1',
      reason: 'مدرس البايلوت الأول',
      expiresAt: null,
    })
    expect(ids).toEqual(['ov-1', 'ov-2'])
    expect(h.rpcCalls).toEqual([
      {
        name: 'apply_role_template',
        args: {
          p_template_id: 'tpl-1',
          p_teacher_id: 't-1',
          p_reason: 'مدرس البايلوت الأول',
        },
      },
    ])
  })

  it('الدالة الغائبة قبل 0063 → null (قسم «قريباً»)', async () => {
    setRpc(null, { code: '42883', message: 'function does not exist' })
    await expect(
      applyRoleTemplate({
        templateId: 'tpl-1',
        teacherId: 't-1',
        reason: 'r',
        expiresAt: null,
      }),
    ).resolves.toBeNull()
  })

  it('حمولة مشوّهة ترجع قائمة فارغة لا كسر', async () => {
    setRpc('not-an-array')
    await expect(
      applyRoleTemplate({
        templateId: 'tpl-1',
        teacherId: 't-1',
        reason: 'r',
        expiresAt: null,
      }),
    ).resolves.toEqual([])
  })
})
