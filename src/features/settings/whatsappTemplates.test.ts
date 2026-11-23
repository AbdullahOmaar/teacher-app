import { describe, expect, it } from 'vitest'
import {
  WHATSAPP_TEMPLATE_CATALOG,
  isWhatsappMessageKind,
  missingOptInPieces,
  templateDef,
} from './whatsappTemplates'

describe('WHATSAPP_TEMPLATE_CATALOG', () => {
  it('covers the four guardian notification kinds exactly once', () => {
    const kinds = WHATSAPP_TEMPLATE_CATALOG.map((d) => d.kind)
    expect(kinds).toEqual([
      'arrival_notice',
      'departure_notice',
      'absence_notice',
      'invoice_issued',
    ])
    expect(new Set(kinds).size).toBe(4)
  })

  it('param counts match the label/sample lists per kind', () => {
    for (const def of WHATSAPP_TEMPLATE_CATALOG) {
      expect(def.paramLabelKeys).toHaveLength(def.paramCount)
      expect(def.paramSampleKeys).toHaveLength(def.paramCount)
      expect(def.defaultName).toBe(def.kind)
    }
  })

  it('templateDef resolves every catalog kind and rejects none of them', () => {
    for (const def of WHATSAPP_TEMPLATE_CATALOG) {
      expect(templateDef(def.kind)).toBe(def)
      expect(isWhatsappMessageKind(def.kind)).toBe(true)
    }
    expect(isWhatsappMessageKind('otp_code')).toBe(false)
    expect(isWhatsappMessageKind('')).toBe(false)
  })
})

describe('missingOptInPieces', () => {
  it('complete setup → no missing pieces', () => {
    expect(missingOptInPieces({ phoneNumberId: '123456', tokenSaved: true })).toEqual([])
  })

  it('missing phone number id only', () => {
    expect(missingOptInPieces({ phoneNumberId: '  ', tokenSaved: true })).toEqual([
      'phoneNumberId',
    ])
  })

  it('missing token only', () => {
    expect(missingOptInPieces({ phoneNumberId: '123456', tokenSaved: false })).toEqual([
      'token',
    ])
  })

  it('both missing → both pieces in stable order', () => {
    expect(missingOptInPieces({ phoneNumberId: '', tokenSaved: false })).toEqual([
      'phoneNumberId',
      'token',
    ])
  })
})
