import { describe, expect, it } from 'vitest'
import {
  NEW_FEATURES,
  featureById,
  featureForPath,
  unseenFeatures,
} from './registry'

// سجل نظام «جديد» (المهمة 24): ثوابت السجل + منطق الخصائص غير المشاهَدة
describe('newFeatures registry', () => {
  it('every entry has a stable id, a version, a path and intro keys', () => {
    for (const f of NEW_FEATURES) {
      expect(f.id).toMatch(/^[a-z0-9-]+$/)
      expect(f.sinceVersion).toMatch(/^\d+\.\d+$/)
      expect(f.path.startsWith('/')).toBe(true)
      expect(f.titleKey.startsWith('whatsNew.')).toBe(true)
      expect(f.bodyKey.startsWith('whatsNew.')).toBe(true)
    }
  })

  it('ids and paths are unique', () => {
    expect(new Set(NEW_FEATURES.map((f) => f.id)).size).toBe(NEW_FEATURES.length)
    expect(new Set(NEW_FEATURES.map((f) => f.path)).size).toBe(NEW_FEATURES.length)
  })

  it('featureById / featureForPath resolve seeds (query string ignored)', () => {
    expect(featureById('support-tickets')?.path).toBe('/support')
    expect(featureForPath('/feedback')?.id).toBe('teacher-feedback')
    expect(featureForPath('/students?import=1')).toBeUndefined()
    expect(featureById('nope')).toBeUndefined()
  })

  it('unseen = registry minus seen; everything seen → empty', () => {
    const all = new Set(NEW_FEATURES.map((f) => f.id))
    expect(unseenFeatures(all)).toEqual([])
    expect(unseenFeatures(new Set())).toEqual([...NEW_FEATURES])
    const some = unseenFeatures(new Set(['support-tickets']))
    expect(some.map((f) => f.id)).not.toContain('support-tickets')
    expect(some.length).toBe(NEW_FEATURES.length - 1)
  })

  it('unknown seen ids are harmless', () => {
    expect(unseenFeatures(new Set(['ghost-feature']))).toEqual([...NEW_FEATURES])
  })
})
