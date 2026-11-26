import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getStaleClientSnapshot,
  markStaleClient,
  resetStaleClientForTests,
  subscribeStaleClient,
} from './staleClient'

/**
 * إشارة «عميل قديم» (3A-903): أحادية الاتجاه — الرفع يشعر المشتركين
 * مرة واحدة، والتكرار صامت، وإلغاء الاشتراك يوقف الإشعار.
 */

beforeEach(() => {
  resetStaleClientForTests()
})

describe('staleClient store', () => {
  it('تبدأ غير مرفوعة', () => {
    expect(getStaleClientSnapshot()).toBe(false)
  })

  it('الرفع يقلب اللقطة ويشعر المشتركين مرة واحدة رغم التكرار', () => {
    const onChange = vi.fn()
    subscribeStaleClient(onChange)
    markStaleClient()
    markStaleClient()
    expect(getStaleClientSnapshot()).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('إلغاء الاشتراك يوقف الإشعار', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeStaleClient(onChange)
    unsubscribe()
    markStaleClient()
    expect(onChange).not.toHaveBeenCalled()
    expect(getStaleClientSnapshot()).toBe(true)
  })
})
