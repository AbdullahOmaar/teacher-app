import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import { isMissingRpcFunction } from '../auth/api'
import type {
  ProfileContentKind,
  ProfileReviewerKind,
  TeacherProfileContentRow,
  TeacherProfilePostRow,
  TeacherProfileRatingRow,
  TeacherProfileRow,
} from '../../types/database'

// ===========================================================================
// صفحة المدرّس الشخصية العامة (3A-929 — migration ‏0074).
//
// جهة العامة (بلا جلسة): RPC واحدة مقيدة الحقول public_teacher_profile
// بالسلاج — لا قراءة مباشرة لأي جدول من anon إطلاقاً، والحمولة تُصفّى
// هنا أيضاً بمحلّل صارم يلتقط الحقول المعلنة فقط (دفاع مزدوج: أي حقل
// خاص يتسلل خادمياً لا يمر للواجهة).
//
// جهة المدرّس (جلسة): قراءة/كتابة مباشرة على الجداول الأربعة بسياسات
// المالك (is_teacher_owner) — والتقييمات قراءة فقط (الإخفاء عبر RPC).
//
// حتى تُطبَّق 0074 عند بوابة تجميد فيز 2: الجداول/الدوال غائبة —
// isProfileSchemaMissing يميّز الغياب فتعرض الأسطح حالة «قريباً»
// المصممة بدل أي خطأ خام (قاعدة 2026-11-26).
// ===========================================================================

/** غياب مخطط 0074 (جدول/دالة غير مطبّقة بعد) — لا خطأ مستخدماً أبداً */
export function isProfileSchemaMissing(error: unknown): boolean {
  if (isMissingRpcFunction(error as { code?: string; message?: string })) {
    return true
  }
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'PGRST205' || e.code === '42P01') return true
  const msg = e.message ?? ''
  return (
    msg.includes('teacher_profile') &&
    (msg.includes('does not exist') || msg.includes('schema cache'))
  )
}

// ---------------------------------------------------------------------------
// تحققات خالصة (تُختبَر وحدوياً)
// ---------------------------------------------------------------------------

/** قاعدة السلاج — مرآة قيد المخطط حرفياً */
export const PROFILE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidProfileSlug(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 40 &&
    PROFILE_SLUG_RE.test(slug)
  )
}

/** تطبيع إدخال السلاج: صغير + مسافات لشرطات + نزع أي حرف غير مسموح */
export function normalizeProfileSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** رابط خارجي صالح: http/https فقط، بصيغة URL حقيقية، بلا فراغات */
export function isValidExternalUrl(raw: string): boolean {
  const v = raw.trim()
  if (v === '' || v.length > 1000 || /\s/.test(v)) return false
  if (!/^https?:\/\//i.test(v)) return false
  try {
    const u = new URL(v)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

/** رابط غلاف صالح — نفس قاعدة الروابط الخارجية بسقف 500 (قيد المخطط) */
export function isValidCoverUrl(raw: string): boolean {
  return raw.trim().length <= 500 && isValidExternalUrl(raw)
}

export interface ContentInput {
  kind: ProfileContentKind
  title: string
  description: string | null
  body: string | null
  externalUrl: string | null
}

/**
 * تحقق إدخال عنصر محتوى — مرآة قيد المخطط: المقال يحتاج نصاً،
 * وغيره يحتاج رابطاً خارجياً صالحاً. يرجع مفتاح خطأ i18n أو null.
 */
export function validateContentInput(input: ContentInput): string | null {
  if (input.title.trim() === '' || input.title.length > 160) {
    return t('profile.errTitleRequired')
  }
  if (input.kind === 'article') {
    if (!input.body || input.body.trim() === '') {
      return t('profile.errBodyRequired')
    }
  } else {
    if (!input.externalUrl || !isValidExternalUrl(input.externalUrl)) {
      return t('profile.errUrlInvalid')
    }
  }
  return null
}

/** رابط الصفحة العامة الكامل لسلاج معطى */
export function buildPublicProfileUrl(origin: string, slug: string): string {
  return `${origin}/t/${encodeURIComponent(slug)}`
}

// ---------------------------------------------------------------------------
// جهة العامة — الحمولة المصفّاة
// ---------------------------------------------------------------------------

export interface PublicProfilePost {
  id: string
  title: string
  body: string
  createdAt: string
}

export interface PublicProfileArticle {
  id: string
  title: string
  description: string | null
  body: string
  createdAt: string
}

export interface PublicProfileLinkItem {
  id: string
  title: string
  description: string | null
  externalUrl: string
}

export interface PublicProfileRatingItem {
  id: string
  stars: number
  comment: string | null
  reviewerKind: ProfileReviewerKind
  studentName: string
  createdAt: string
}

export interface PublicProfile {
  found: true
  displayName: string
  avatarUrl: string | null
  headline: string | null
  bio: string | null
  coverImageUrl: string | null
  slug: string
  brandName: string | null
  brandLogoUrl: string | null
  brandAccent: string | null
  posts: PublicProfilePost[]
  articles: PublicProfileArticle[]
  books: PublicProfileLinkItem[]
  courses: PublicProfileLinkItem[]
  playlists: PublicProfileLinkItem[]
  ratingsCount: number
  ratingsAverage: number | null
  ratings: PublicProfileRatingItem[]
  bookingAvailable: boolean
}

export type PublicProfileResult = PublicProfile | { found: false }

function asString(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null
    ? (v as Record<string, unknown>)
    : null
}

function parseLinkItems(v: unknown): PublicProfileLinkItem[] {
  if (!Array.isArray(v)) return []
  const out: PublicProfileLinkItem[] = []
  for (const item of v) {
    const r = asRecord(item)
    if (!r) continue
    const id = asString(r.id)
    const title = asString(r.title)
    const url = asString(r.external_url)
    if (!id || !title || !url) continue
    out.push({ id, title, description: asString(r.description), externalUrl: url })
  }
  return out
}

/**
 * محلّل صارم لحمولة public_teacher_profile: يلتقط الحقول المعلنة
 * فقط — أي حقل إضافي (هاتف/بريد/معرّف داخلي) يُسقَط هنا ولو وصل.
 * found=false عند أي تشوّه جوهري.
 */
export function parsePublicProfile(data: unknown): PublicProfileResult {
  const root = asRecord(data)
  if (!root || root.found !== true) return { found: false }
  const teacher = asRecord(root.teacher)
  if (!teacher) return { found: false }
  const displayName = asString(teacher.display_name)
  const slug = asString(teacher.slug)
  if (!displayName || !slug) return { found: false }

  const brand = asRecord(root.brand)
  const postsRaw = Array.isArray(root.posts) ? root.posts : []
  const posts: PublicProfilePost[] = []
  for (const item of postsRaw) {
    const r = asRecord(item)
    if (!r) continue
    const id = asString(r.id)
    const title = asString(r.title)
    const body = asString(r.body)
    if (!id || !title || body === null) continue
    posts.push({ id, title, body, createdAt: asString(r.created_at) ?? '' })
  }

  const articlesRaw = Array.isArray(root.articles) ? root.articles : []
  const articles: PublicProfileArticle[] = []
  for (const item of articlesRaw) {
    const r = asRecord(item)
    if (!r) continue
    const id = asString(r.id)
    const title = asString(r.title)
    const body = asString(r.body)
    if (!id || !title || body === null) continue
    articles.push({
      id,
      title,
      description: asString(r.description),
      body,
      createdAt: asString(r.created_at) ?? '',
    })
  }

  const ratings = asRecord(root.ratings)
  const ratingItemsRaw =
    ratings && Array.isArray(ratings.items) ? ratings.items : []
  const ratingItems: PublicProfileRatingItem[] = []
  for (const item of ratingItemsRaw) {
    const r = asRecord(item)
    if (!r) continue
    const id = asString(r.id)
    const stars = typeof r.stars === 'number' ? r.stars : null
    const studentName = asString(r.student_name)
    if (!id || stars === null || !studentName) continue
    ratingItems.push({
      id,
      stars,
      comment: asString(r.comment),
      reviewerKind: r.reviewer_kind === 'guardian' ? 'guardian' : 'student',
      studentName,
      createdAt: asString(r.created_at) ?? '',
    })
  }

  const booking = asRecord(root.booking)
  const accent = brand ? asString(brand.accent) : null

  return {
    found: true,
    displayName,
    avatarUrl: asString(teacher.avatar_url),
    headline: asString(teacher.headline),
    bio: asString(teacher.bio),
    coverImageUrl: asString(teacher.cover_image_url),
    slug,
    brandName: brand ? asString(brand.name) : null,
    brandLogoUrl: brand ? brandLogoUrl(asString(brand.logo_path)) : null,
    brandAccent: accent && isValidAccent(accent) ? accent.toLowerCase() : null,
    posts,
    articles,
    books: parseLinkItems(root.books),
    courses: parseLinkItems(root.courses),
    playlists: parseLinkItems(root.playlists),
    ratingsCount:
      ratings && typeof ratings.count === 'number' ? ratings.count : 0,
    ratingsAverage:
      ratings && typeof ratings.average === 'number' ? ratings.average : null,
    ratings: ratingItems,
    bookingAvailable: booking?.available === true,
  }
}

/** جلب الصفحة العامة بالسلاج — غياب الدالة (قبل 0074) = غير موجودة */
export async function fetchPublicProfile(slug: string): Promise<PublicProfileResult> {
  const { data, error } = await db().rpc('public_teacher_profile', {
    p_slug: slug,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return { found: false }
    throw error
  }
  return parsePublicProfile(data)
}

// ---------------------------------------------------------------------------
// جهة المدرّس — إدارة مباشرة (سياسات المالك)
// ---------------------------------------------------------------------------

const PROFILE_COLS =
  'teacher_id, slug, headline, bio, cover_image_url, is_public, created_at, updated_at'
const POST_COLS =
  'id, teacher_id, title, body, is_published, sort_order, created_at, updated_at'
const CONTENT_COLS =
  'id, teacher_id, kind, title, description, body, external_url, is_published, sort_order, created_at, updated_at'
const RATING_COLS =
  'id, teacher_id, student_id, reviewer_kind, guardian_id, stars, comment, is_hidden, created_at, updated_at'

export async function fetchMyProfile(
  teacherId: string,
): Promise<TeacherProfileRow | null> {
  const { data, error } = await db()
    .from('teacher_profiles')
    .select(PROFILE_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export interface ProfileUpsertInput {
  slug: string
  headline: string | null
  bio: string | null
  coverImageUrl: string | null
  isPublic: boolean
}

export async function upsertMyProfile(
  teacherId: string,
  input: ProfileUpsertInput,
): Promise<void> {
  const { error } = await db()
    .from('teacher_profiles')
    .upsert(
      {
        teacher_id: teacherId,
        slug: input.slug,
        headline: input.headline,
        bio: input.bio,
        cover_image_url: input.coverImageUrl,
        is_public: input.isPublic,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'teacher_id' },
    )
  if (error) throw error
}

/** هل السلاج محجوز لمدرّس آخر؟ (فحص ودود قبل الحفظ — القيد هو الحاكم) */
export async function isSlugTakenByOther(
  teacherId: string,
  slug: string,
): Promise<boolean> {
  const { data, error } = await db()
    .from('teacher_profiles')
    .select('teacher_id')
    .eq('slug', slug)
    .neq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

export async function fetchMyPosts(
  teacherId: string,
): Promise<TeacherProfilePostRow[]> {
  const { data, error } = await db()
    .from('teacher_profile_posts')
    .select(POST_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export interface PostInput {
  title: string
  body: string
  isPublished: boolean
}

export async function createPost(
  teacherId: string,
  input: PostInput,
): Promise<void> {
  const { error } = await db().from('teacher_profile_posts').insert({
    teacher_id: teacherId,
    title: input.title,
    body: input.body,
    is_published: input.isPublished,
  })
  if (error) throw error
}

export async function updatePost(id: string, input: PostInput): Promise<void> {
  const { error } = await db()
    .from('teacher_profile_posts')
    .update({
      title: input.title,
      body: input.body,
      is_published: input.isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await db().from('teacher_profile_posts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchMyContent(
  teacherId: string,
): Promise<TeacherProfileContentRow[]> {
  const { data, error } = await db()
    .from('teacher_profile_content')
    .select(CONTENT_COLS)
    .eq('teacher_id', teacherId)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TeacherProfileContentRow[]
}

export async function createContent(
  teacherId: string,
  input: ContentInput & { isPublished: boolean },
): Promise<void> {
  const { error } = await db().from('teacher_profile_content').insert({
    teacher_id: teacherId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    body: input.kind === 'article' ? input.body : null,
    external_url: input.kind === 'article' ? null : input.externalUrl,
    is_published: input.isPublished,
  })
  if (error) throw error
}

export async function updateContent(
  id: string,
  input: ContentInput & { isPublished: boolean },
): Promise<void> {
  const { error } = await db()
    .from('teacher_profile_content')
    .update({
      kind: input.kind,
      title: input.title,
      description: input.description,
      body: input.kind === 'article' ? input.body : null,
      external_url: input.kind === 'article' ? null : input.externalUrl,
      is_published: input.isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteContent(id: string): Promise<void> {
  const { error } = await db()
    .from('teacher_profile_content')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function fetchMyRatings(
  teacherId: string,
): Promise<TeacherProfileRatingRow[]> {
  const { data, error } = await db()
    .from('teacher_profile_ratings')
    .select(RATING_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TeacherProfileRatingRow[]
}

/** إخفاء/إظهار تقييم عبر الـ RPC — لا حذف ولا تعديل نص بالتصميم */
export async function setRatingHidden(
  ratingId: string,
  hidden: boolean,
): Promise<void> {
  const { error } = await db().rpc('set_teacher_rating_hidden', {
    p_rating_id: ratingId,
    p_hidden: hidden,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// بطاقة التقييم في البوابات — إرسال وقراءة تقييمي الحالي
// ---------------------------------------------------------------------------

export interface MyRating {
  stars: number
  comment: string | null
}

export function parseMyRating(data: unknown): MyRating | null {
  const r = asRecord(data)
  if (!r || typeof r.stars !== 'number') return null
  return { stars: r.stars, comment: asString(r.comment) }
}

export async function fetchMyGuardianRating(
  rawToken: string,
  studentId: string,
): Promise<MyRating | null> {
  const { data, error } = await db().rpc('my_teacher_rating_guardian', {
    p_token: rawToken,
    p_student_id: studentId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseMyRating(data)
}

export async function submitGuardianRating(
  rawToken: string,
  studentId: string,
  stars: number,
  comment: string | null,
): Promise<void> {
  const { error } = await db().rpc('submit_teacher_rating_guardian', {
    p_token: rawToken,
    p_student_id: studentId,
    p_stars: stars,
    p_comment: comment ?? undefined,
  })
  if (error) throw error
}

export async function fetchMyStudentRating(
  rawToken: string,
): Promise<MyRating | null> {
  const { data, error } = await db().rpc('my_teacher_rating_student', {
    p_token: rawToken,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseMyRating(data)
}

export async function submitStudentRating(
  rawToken: string,
  stars: number,
  comment: string | null,
): Promise<void> {
  const { error } = await db().rpc('submit_teacher_rating_student', {
    p_token: rawToken,
    p_stars: stars,
    p_comment: comment ?? undefined,
  })
  if (error) throw error
}

/** رسالة مهذبة من خطأ إرسال تقييم — بلا أي تفاصيل داخلية أبداً */
export function ratingErrorMessage(error: unknown): string {
  void error
  return t('profile.rateErrGeneric')
}
