import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import {
  buildPublicProfileUrl,
  isValidCoverUrl,
  isValidExternalUrl,
  isValidProfileSlug,
  normalizeProfileSlug,
  parseMyRating,
  parsePublicProfile,
  validateContentInput,
} from './api'

// اختبارات وحدة لمساعدات الصفحة الشخصية النقية (0074 — 3A-929):
// تحقق السلاج والروابط ومدخلات المحتوى، والمحلّل الصارم لحمولة
// الصفحة العامة (لا تسرّب حقول خاصة أبداً). مسارات الـ RPC والبوابات
// الخادمية (ظهور/استحقاق/أهلية تقييم) تغطيها اختبارات التفويض الحية.

describe('isValidProfileSlug', () => {
  it('يقبل سلاجاً سليماً', () => {
    expect(isValidProfileSlug('mr-ahmed')).toBe(true)
    expect(isValidProfileSlug('a1b2')).toBe(true)
    expect(isValidProfileSlug('ahmed')).toBe(true)
  })

  it('يرفض القصير والطويل', () => {
    expect(isValidProfileSlug('ab')).toBe(false)
    expect(isValidProfileSlug('a'.repeat(41))).toBe(false)
  })

  it('يرفض الشرطات المعلّقة والمضاعفة والحروف الكبيرة والمسافات', () => {
    expect(isValidProfileSlug('-abc')).toBe(false)
    expect(isValidProfileSlug('abc-')).toBe(false)
    expect(isValidProfileSlug('a--b')).toBe(false)
    expect(isValidProfileSlug('Abc')).toBe(false)
    expect(isValidProfileSlug('a b')).toBe(false)
    expect(isValidProfileSlug('')).toBe(false)
  })
})

describe('normalizeProfileSlug', () => {
  it('يحوّل المسافات والشرطات السفلية لشرطات ويصغّر الحروف', () => {
    expect(normalizeProfileSlug('  Mr Ahmed_Math ')).toBe('mr-ahmed-math')
    expect(normalizeProfileSlug('AHMED--MATH')).toBe('ahmed-math')
  })

  it('يحذف أي حرف خارج النمط', () => {
    expect(normalizeProfileSlug('mr.ahmed!')).toBe('mrahmed')
    expect(normalizeProfileSlug('أحمد')).toBe('')
  })
})

describe('buildPublicProfileUrl', () => {
  it('يبني مسار /t/<slug>', () => {
    expect(buildPublicProfileUrl('https://app.example.com', 'mr-ahmed')).toBe(
      'https://app.example.com/t/mr-ahmed',
    )
  })
})

describe('isValidExternalUrl / isValidCoverUrl', () => {
  it('يقبل http/https بنطاق حقيقي', () => {
    expect(isValidExternalUrl('https://youtube.com/playlist?list=x')).toBe(true)
    expect(isValidExternalUrl('http://books.example.org/a.pdf')).toBe(true)
  })

  it('يرفض مخططات أخرى ونطاقات بلا نقطة ومسافات', () => {
    expect(isValidExternalUrl('ftp://example.com/x')).toBe(false)
    expect(isValidExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isValidExternalUrl('https://localhost/x')).toBe(false)
    expect(isValidExternalUrl('https://exa mple.com')).toBe(false)
    expect(isValidExternalUrl('not-a-url')).toBe(false)
    expect(isValidExternalUrl('')).toBe(false)
  })

  it('يطبّق حدّي الطول: 1000 للمحتوى و500 للغلاف', () => {
    const long = `https://example.com/${'a'.repeat(1000)}`
    expect(isValidExternalUrl(long)).toBe(false)
    expect(isValidCoverUrl(long)).toBe(false)
    expect(isValidCoverUrl('https://cdn.example.com/cover.jpg')).toBe(true)
  })
})

describe('validateContentInput', () => {
  it('المقال يحتاج نصاً', () => {
    expect(
      validateContentInput({
        kind: 'article',
        title: 'شرح الدرس',
        description: null,
        body: '  ',
        externalUrl: null,
      }),
    ).toBe(t('profile.errBodyRequired'))
    expect(
      validateContentInput({
        kind: 'article',
        title: 'شرح الدرس',
        description: null,
        body: 'نص المقال',
        externalUrl: null,
      }),
    ).toBeNull()
  })

  it('غير المقال يحتاج رابطاً خارجياً صالحاً', () => {
    expect(
      validateContentInput({
        kind: 'book',
        title: 'كتاب التمارين',
        description: null,
        body: null,
        externalUrl: null,
      }),
    ).toBe(t('profile.errUrlInvalid'))
    expect(
      validateContentInput({
        kind: 'course',
        title: 'كورس',
        description: null,
        body: null,
        externalUrl: 'ftp://x.com/a',
      }),
    ).toBe(t('profile.errUrlInvalid'))
    expect(
      validateContentInput({
        kind: 'playlist',
        title: 'قائمة تشغيل',
        description: null,
        body: null,
        externalUrl: 'https://youtube.com/playlist?list=1',
      }),
    ).toBeNull()
  })

  it('العنوان الفارغ مرفوض قبل أي فحص آخر', () => {
    expect(
      validateContentInput({
        kind: 'article',
        title: ' ',
        description: null,
        body: 'نص',
        externalUrl: null,
      }),
    ).toBe(t('profile.errTitleRequired'))
  })
})

const VALID_PAYLOAD = {
  found: true,
  teacher: {
    display_name: 'مستر أحمد',
    avatar_url: 'https://cdn.example.com/a.png',
    headline: 'مدرّس رياضيات',
    bio: 'نبذة قصيرة',
    cover_image_url: 'https://cdn.example.com/c.jpg',
    slug: 'mr-ahmed',
  },
  brand: { name: 'سنتر النور', logo_path: null, accent: '#3366FF' },
  posts: [
    { id: 'p1', title: 'منشور', body: 'نص المنشور', created_at: '2026-01-01' },
    { id: 'p2', title: '', body: 'بلا عنوان' },
  ],
  articles: [
    {
      id: 'a1',
      title: 'مقال',
      description: 'وصف',
      body: 'نص المقال',
      created_at: '2026-01-02',
    },
  ],
  books: [
    { id: 'b1', title: 'كتاب', description: null, external_url: 'https://books.example.com/x.pdf' },
    { id: 'b2', title: 'بلا رابط', description: null, external_url: null },
  ],
  courses: [],
  playlists: [
    { id: 'pl1', title: 'قائمة', description: 'د', external_url: 'https://youtube.com/playlist?list=1' },
  ],
  ratings: {
    count: 2,
    average: 4.5,
    items: [
      {
        id: 'r1',
        stars: 5,
        comment: 'ممتاز',
        reviewer_kind: 'guardian',
        student_name: 'محمد',
        created_at: '2026-01-03',
      },
      {
        id: 'r2',
        stars: 4,
        comment: null,
        reviewer_kind: 'student',
        student_name: 'سارة',
        created_at: '2026-01-04',
      },
    ],
  },
  booking: { available: true },
}

describe('parsePublicProfile', () => {
  it('يرسم الحمولة السليمة ويسقط العناصر الناقصة', () => {
    const out = parsePublicProfile(VALID_PAYLOAD)
    expect(out.found).toBe(true)
    if (!out.found) return
    expect(out.displayName).toBe('مستر أحمد')
    expect(out.slug).toBe('mr-ahmed')
    expect(out.brandName).toBe('سنتر النور')
    expect(out.brandAccent).toBe('#3366ff')
    expect(out.posts).toHaveLength(1)
    expect(out.articles).toHaveLength(1)
    expect(out.books).toHaveLength(1)
    expect(out.playlists).toHaveLength(1)
    expect(out.ratingsCount).toBe(2)
    expect(out.ratingsAverage).toBe(4.5)
    expect(out.ratings[0]?.reviewerKind).toBe('guardian')
    expect(out.bookingAvailable).toBe(true)
  })

  it('لا يمرّر أي حقل خاص ولو لوّثت الحمولة به', () => {
    const polluted = {
      ...VALID_PAYLOAD,
      teacher: {
        ...VALID_PAYLOAD.teacher,
        phone: '01001234567',
        email: 'secret@example.com',
        teacher_id: '00000000-0000-0000-0000-000000000000',
      },
      internal_note: 'do-not-leak',
    }
    const out = parsePublicProfile(polluted)
    expect(out.found).toBe(true)
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('01001234567')
    expect(serialized).not.toContain('secret@example.com')
    expect(serialized).not.toContain('00000000-0000-0000-0000-000000000000')
    expect(serialized).not.toContain('do-not-leak')
    expect(serialized).not.toContain('teacher_id')
  })

  it('found=false أو تشوّه جوهري ⇒ غير موجود', () => {
    expect(parsePublicProfile({ found: false })).toEqual({ found: false })
    expect(parsePublicProfile(null)).toEqual({ found: false })
    expect(parsePublicProfile('x')).toEqual({ found: false })
    expect(parsePublicProfile({ found: true })).toEqual({ found: false })
    expect(parsePublicProfile({ found: true, teacher: { slug: 'x' } })).toEqual({
      found: false,
    })
  })

  it('تقييم بنوع مراجع مجهول يُقرأ كطالب ولا يرمي', () => {
    const payload = {
      ...VALID_PAYLOAD,
      ratings: {
        count: 1,
        average: 3,
        items: [
          {
            id: 'r9',
            stars: 3,
            comment: null,
            reviewer_kind: 'alien',
            student_name: 'س',
            created_at: '',
          },
        ],
      },
    }
    const out = parsePublicProfile(payload)
    expect(out.found).toBe(true)
    if (!out.found) return
    expect(out.ratings[0]?.reviewerKind).toBe('student')
  })
})

describe('parseMyRating', () => {
  it('يرسم تقييماً قائماً', () => {
    expect(parseMyRating({ stars: 4, comment: 'كويس' })).toEqual({
      stars: 4,
      comment: 'كويس',
    })
    expect(parseMyRating({ stars: 5, comment: null })).toEqual({
      stars: 5,
      comment: null,
    })
  })

  it('غياب/تشوّه ⇒ null', () => {
    expect(parseMyRating(null)).toBeNull()
    expect(parseMyRating({})).toBeNull()
    expect(parseMyRating({ stars: '5' })).toBeNull()
  })
})
