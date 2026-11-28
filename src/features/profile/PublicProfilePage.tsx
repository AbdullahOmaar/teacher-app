import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarCheck2,
  ExternalLink,
  GraduationCap,
  Link2Off,
  ListVideo,
  MonitorPlay,
  Newspaper,
  Star,
  UserRound,
} from 'lucide-react'
import { PublicPageShell } from '../../components/PublicPageShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Sheet } from '../../components/ui/Sheet'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { t } from '../../i18n'
import {
  fetchPublicProfile,
  type PublicProfile,
  type PublicProfileArticle,
  type PublicProfileLinkItem,
} from './api'
import { StarsRow } from './Stars'

/**
 * صفحة المدرّس الشخصية العامة (3A-929 — 0074): ‎/t/:slug‎ بلا جلسة.
 *
 * المصدر الوحيد RPC ‏public_teacher_profile المقيدة — ترجع found=false
 * بنفس الشكل للمجهول والمخفي وغير المستحق فتعرض الصفحة حالة مهذبة
 * واحدة (لا تمييز يتسرب). التبويبات الأربعة المعتمدة: منشورات /
 * كورسات / كتب / عن المدرّس — والتقييمات الحقيقية ملخصها في الترويسة
 * وقائمتها في «عن المدرّس». زر الحجز بارز (ترويسة + شريط سفلي ثابت)
 * ويودي لصفحة الحجز بمسار السلاج ‎/book?p=<slug>‎.
 */

type TabId = 'posts' | 'courses' | 'books' | 'about'

const TABS: { id: TabId; label: string; Icon: IconComponent }[] = [
  { id: 'posts', label: t('profile.tabPosts'), Icon: Newspaper },
  { id: 'courses', label: t('profile.tabCourses'), Icon: MonitorPlay },
  { id: 'books', label: t('profile.tabBooks'), Icon: BookOpen },
  { id: 'about', label: t('profile.tabAbout'), Icon: UserRound },
]

/** نص طويل كفقرات — تقسيم أسطر فقط (markdown-lite بلا محلّل) */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para, i) => (
          <p key={i} className="type-body whitespace-pre-line mb-3 last:mb-0">
            {para}
          </p>
        ))}
    </>
  )
}

function LinkItemCard({ item }: { item: PublicProfileLinkItem }) {
  return (
    <Card className="rise-in">
      <div className="type-section mb-1">{item.title}</div>
      {item.description ? (
        <p className="text-muted type-secondary mb-3">{item.description}</p>
      ) : null}
      <a
        href={item.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-primary font-semibold text-[14px]"
      >
        <ExternalLink size={16} />
        {t('profile.openExternal')}
      </a>
    </Card>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <Card className="text-center py-6">
      <p className="text-muted type-secondary mb-0">{text}</p>
    </Card>
  )
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const [tab, setTab] = useState<TabId>('posts')
  const [openArticle, setOpenArticle] = useState<PublicProfileArticle | null>(null)

  const brand = {
    name: profile.brandName ?? profile.displayName,
    logo_url: profile.brandLogoUrl ?? profile.avatarUrl,
    accent: profile.brandAccent,
  }

  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('profile.pageLogoAlt')}
      fallbackTitle={profile.displayName}
      subtitle={profile.headline}
      FallbackIcon={GraduationCap}
    >
      {/* الغلاف + الهوية */}
      <div className="rise-in">
        {profile.coverImageUrl ? (
          <img
            src={profile.coverImageUrl}
            alt=""
            className="w-full h-40 object-cover rounded-2xl border border-border mb-3"
          />
        ) : (
          <div className="w-full h-24 rounded-2xl bg-soft border border-border mb-3" />
        )}
        <div className="flex items-start gap-3 mb-3">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <span className="w-16 h-16 rounded-full bg-soft text-primary flex items-center justify-center shrink-0">
              <GraduationCap size={30} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="type-title mb-0.5">{profile.displayName}</h1>
            {profile.headline ? (
              <p className="text-muted type-secondary mb-1">{profile.headline}</p>
            ) : null}
            {profile.ratingsCount > 0 && profile.ratingsAverage !== null ? (
              <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold">
                <Star size={15} className="text-warn fill-warn" />
                {t('profile.ratingSummary', {
                  average: profile.ratingsAverage,
                  count: profile.ratingsCount,
                })}
              </span>
            ) : (
              <span className="text-muted text-[13px]">
                {t('profile.ratingSummaryNone')}
              </span>
            )}
          </div>
        </div>
        {profile.bookingAvailable ? (
          <Link to={`/book?p=${encodeURIComponent(profile.slug)}`} className="block mb-4">
            <Button full>
              <CalendarCheck2 size={19} />
              {t('profile.bookNow')}
            </Button>
          </Link>
        ) : null}
      </div>

      {/* التبويبات */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto" role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-[13.5px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
              tab === id
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-card text-muted border-border hover:bg-soft'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <div>
          {profile.posts.length === 0 ? (
            <EmptyNote text={t('profile.emptyPosts')} />
          ) : (
            profile.posts.map((post) => (
              <Card key={post.id} className="rise-in">
                <div className="type-section mb-1.5">{post.title}</div>
                <Paragraphs text={post.body} />
              </Card>
            ))
          )}
          {profile.articles.length > 0 ? (
            <>
              <h2 className="type-section mt-5 mb-2.5">{t('profile.articlesTitle')}</h2>
              {profile.articles.map((article) => (
                <Card key={article.id} className="rise-in">
                  <div className="type-section mb-1">{article.title}</div>
                  {article.description ? (
                    <p className="text-muted type-secondary mb-3">
                      {article.description}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenArticle(article)}
                    className="text-primary font-semibold text-[14px] cursor-pointer bg-transparent border-0 p-0"
                  >
                    {t('profile.readMore')}
                  </button>
                </Card>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'courses' ? (
        <div>
          {profile.courses.length === 0 ? (
            <EmptyNote text={t('profile.emptyCourses')} />
          ) : (
            profile.courses.map((item) => <LinkItemCard key={item.id} item={item} />)
          )}
          {profile.playlists.length > 0 ? (
            <>
              <h2 className="type-section mt-5 mb-2.5 inline-flex items-center gap-1.5">
                <ListVideo size={18} />
                {t('profile.playlistsTitle')}
              </h2>
              {profile.playlists.map((item) => (
                <LinkItemCard key={item.id} item={item} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'books' ? (
        <div>
          {profile.books.length === 0 ? (
            <EmptyNote text={t('profile.emptyBooks')} />
          ) : (
            profile.books.map((item) => <LinkItemCard key={item.id} item={item} />)
          )}
        </div>
      ) : null}

      {tab === 'about' ? (
        <div>
          {profile.bio ? (
            <Card className="rise-in">
              <Paragraphs text={profile.bio} />
            </Card>
          ) : (
            <EmptyNote text={t('profile.emptyAbout')} />
          )}
          <h2 className="type-section mt-5 mb-2.5">{t('profile.ratingsTitle')}</h2>
          {profile.ratings.length === 0 ? (
            <EmptyNote text={t('profile.emptyRatings')} />
          ) : (
            profile.ratings.map((rating) => (
              <Card key={rating.id} className="rise-in">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-[14px]">
                    {rating.reviewerKind === 'guardian'
                      ? t('profile.reviewByGuardian', { name: rating.studentName })
                      : t('profile.reviewByStudent', { name: rating.studentName })}
                  </span>
                  <StarsRow stars={rating.stars} size={14} />
                </div>
                {rating.comment ? (
                  <p className="text-muted type-secondary mb-0">{rating.comment}</p>
                ) : null}
              </Card>
            ))
          )}
        </div>
      ) : null}

      {/* شريط حجز سفلي ثابت — بروز دائم لزر الحجز */}
      {profile.bookingAvailable ? (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-card/95 backdrop-blur border-t border-border">
          <div className="mx-auto max-w-[640px] px-4 py-2.5">
            <Link to={`/book?p=${encodeURIComponent(profile.slug)}`} className="block">
              <Button full>
                <CalendarCheck2 size={19} />
                {t('profile.bookNow')}
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
      {profile.bookingAvailable ? <div className="h-16" /> : null}

      {/* قارئ المقال */}
      <Sheet
        open={openArticle !== null}
        title={openArticle?.title}
        onClose={() => setOpenArticle(null)}
      >
        {openArticle ? <Paragraphs text={openArticle.body} /> : null}
      </Sheet>
    </PublicPageShell>
  )
}

export function PublicProfilePage() {
  const { slug = '' } = useParams()

  const pageQ = useQuery({
    queryKey: ['public-profile', slug],
    enabled: Boolean(slug),
    queryFn: () => fetchPublicProfile(slug),
    retry: false,
  })

  const profile = pageQ.data?.found ? pageQ.data : null

  // أساسيات المشاركة/SEO: عنوان ووصف من بيانات الصفحة نفسها
  useEffect(() => {
    if (!profile) return
    const prevTitle = document.title
    document.title = profile.headline
      ? `${profile.displayName} — ${profile.headline}`
      : profile.displayName
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(
        `meta[property="${property}"]`,
      )
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
    setMeta('og:title', profile.displayName)
    if (profile.bio) setMeta('og:description', profile.bio.slice(0, 200))
    if (profile.coverImageUrl) setMeta('og:image', profile.coverImageUrl)
    return () => {
      document.title = prevTitle
    }
  }, [profile])

  if (pageQ.isPending) {
    return (
      <PublicPageShell
        logoAlt={t('profile.pageLogoAlt')}
        fallbackTitle={t('profile.pageNotFoundTitle')}
        FallbackIcon={GraduationCap}
      >
        <SkeletonCards />
      </PublicPageShell>
    )
  }

  if (!profile) {
    return (
      <PublicPageShell
        logoAlt={t('profile.pageLogoAlt')}
        fallbackTitle={t('profile.pageNotFoundTitle')}
        FallbackIcon={GraduationCap}
      >
        <Card className="text-center py-8 rise-in">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
            <Link2Off size={28} />
          </div>
          <div className="type-section mb-1">{t('profile.pageNotFoundTitle')}</div>
          <p className="text-muted type-secondary mb-0">
            {t('profile.pageNotFoundHint')}
          </p>
        </Card>
      </PublicPageShell>
    )
  }

  return <ProfileBody profile={profile} />
}
