import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Bell, CalendarCheck2, Check, ChevronDown, ChevronUp, FolderCog, GraduationCap, Handshake, ImagePlus, Mail, MessageCircle, MonitorSmartphone, Palette, SlidersHorizontal, Trash2, UserRound, type LucideIcon } from 'lucide-react'
import { PageToolBar } from '../../components/ui/PageToolBar'
import { Button } from '../../components/ui/Button'
import { Chip, Field, TextArea, TextInput } from '../../components/ui/form'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../components/ui/states'
import { useAuth } from '../../lib/AuthProvider'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useTheme, type ThemeMode } from '../../hooks/useTheme'
import { setActiveTeacherId } from '../../lib/workspace'
import {
  ASSISTANT_DEFAULT_PERMISSIONS,
  INVITE_EMAIL_RE,
  PERMISSION_LABELS,
  normalizeInviteEmail,
} from '../auth/api'
import {
  useCancelTeamInvite,
  useCreateCentre,
  useInviteAssistant,
  useInviteAssistantByEmail,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateMemberPermissions,
  useUpdateOwnProfile,
} from '../auth/hooks'
import { DEFAULT_WA_TEMPLATE } from '../invoices/api'
import { InstallAppCard } from './InstallAppCard'
import { EnrolLinkCard } from '../enrol/EnrolLinkCard'
import { PushNotificationsCard } from './PushNotificationsCard'
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard'
import { formatDateLabel } from '../schedule/api'
import { REMINDER_OPTIONS, THEME_MODES, type TeacherSettingsInput } from './api'
import {
  useRemoveBrandLogo,
  useTeacherSettings,
  useUpdateTeacherSettings,
  useUploadBrandLogo,
} from './hooks'
import { ACCENT_PRESETS, brandLogoUrl } from '../../lib/brand'
import { Logo } from '../../components/brand/Logo'
import type { TeacherMemberRow } from '../../types/database'
import { t } from '../../i18n'

/** متغيرات قالب رسالة واتساب المتاحة في الإيصال (المرجع §3.16) */
const WA_TEMPLATE_VARS = ['{guardian}', '{name}', '{period}', '{paid}', '{total}', '{balance}']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

/** تعريف قسم إعدادات واحد في خريطة الصفحة (أنكورز + أكورديون) */
interface SettingsSectionDef {
  id: string
  title: string
  icon: LucideIcon
}

/**
 * قسم إعدادات قابل للطي (موجة W3 — بحث R-11: أكورديون صفحات الأقسام):
 * ترويسة وصفية تعمل كخريطة للصفحة، والمحتوى تحتها عند الفتح. الأقسام
 * المدمجة (بطاقات مكوّنات قائمة بعناوينها الداخلية مثل Push) تُمرَّر
 * بـ bare: تُعرض كما هي ويُخفى عنوانها الداخلي اكتفاءً بالترويسة.
 */
function SettingsSection({
  def,
  open,
  onToggle,
  bare = false,
  children,
}: {
  def: SettingsSectionDef
  open: boolean
  onToggle: () => void
  bare?: boolean
  children: ReactNode
}) {
  const Icon = def.icon
  return (
    <div
      className="mb-3 scroll-mt-[118px]"
      id={`settings-section-${def.id}`}
      data-settings-section={def.id}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 bg-card border border-border rounded-2xl px-3 min-h-[52px] cursor-pointer text-text"
      >
        <Icon size={22} className="text-primary shrink-0" />
        <span className="font-bold text-[15px] flex-1 text-start">{def.title}</span>
        {open ? (
          <ChevronUp size={20} className="text-muted shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-muted shrink-0" />
        )}
      </button>
      {open &&
        (bare ? (
          <div className="mt-2 -mb-3 [&_h2]:hidden">{children}</div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-4 shadow-card mt-2">
            {children}
          </div>
        ))}
    </div>
  )
}

/**
 * الإعدادات — من خطوة Auth: حسابي (البريد + معرّف الحساب)، ملف المدرس
 * (teachers: الاسم/الموبايل/الصورة)، تبديل مساحة العمل، فريق المساعدين
 * عبر teacher_members، وتسجيل الخروج.
 * والخطوة 10 أكملتها بـ«إعدادات التطبيق»: كل أعمدة teacher_settings
 * القابلة للتحرير (whatsapp_template لقالب إيصال الواتساب،
 * center_share_percent لنسبة السنتر في شاشة الفلوس، reminder_minutes،
 * وtheme مربوطاً بخطاف useTheme القائم ومحفوظاً في القاعدة معاً) +
 * عرض last_export_at الذي تحدّثه شاشتا التصدير والنسخ الاحتياطي.
 */
export function SettingsPage() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const teacher = useCurrentTeacher()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [copied, setCopied] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // نموذج تعديل الملف الشخصي
  const ownTeacher = teacher.status === 'ready' ? teacher.ownTeacher : null
  const ownTeachers = teacher.status === 'ready' ? teacher.ownTeachers : []
  const activeCentreId = teacher.status === 'ready' ? teacher.teacherId : null
  // السنتر المُدار في هذه الصفحة (ملف/إعدادات/هوية/فريق): السنتر النشط إن
  // كان مملوكاً، وإلا الأساسي — فعند العمل كمساعد عند مدرس آخر تبقى
  // إعدادات سنترك الخاص معروضة وقابلة للتحرير كما قبل 0016.
  const managedCentre =
    teacher.status === 'ready' && teacher.role === 'owner' ? teacher.teacher : ownTeacher
  const managedCentreId = managedCentre?.id ?? ''
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profilePhone, setProfilePhone] = useState<string | null>(null)
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const updateProfile = useUpdateOwnProfile(managedCentreId)

  // إعدادات التطبيق — teacher_settings لحساب المدرس نفسه (RLS للمالك فقط)
  const theme = useTheme()
  const settingsQ = useTeacherSettings(managedCentreId || undefined, Boolean(managedCentre))
  const updateSettings = useUpdateTeacherSettings(managedCentreId)
  const [waTpl, setWaTpl] = useState<string | null>(null)
  const [centerShare, setCenterShare] = useState<string | null>(null)
  const [reminder, setReminder] = useState<number | null>(null)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)

  // الهوية البيضاء (Phase 3 خطوة 1) — brandAccent بحالة undefined =
  // «لسه مالمستهاش» فيسقط لقيمة القاعدة، وnull الصريح = إعادة تعيين.
  const [brandName, setBrandName] = useState<string | null>(null)
  const [brandAccent, setBrandAccent] = useState<string | null | undefined>(undefined)
  const [brandMsg, setBrandMsg] = useState<string | null>(null)
  const [confirmLogoRemove, setConfirmLogoRemove] = useState(false)
  const uploadLogo = useUploadBrandLogo(managedCentreId)
  const removeLogo = useRemoveBrandLogo(managedCentreId)

  // مزامنة الثيم من القاعدة مرة واحدة عند تحميل الإعدادات: عمود
  // teacher_settings.theme هو المحفوظ حسابياً وخطاف useTheme هو آلية
  // التطبيق — عند اختلافهما عند الفتح تسود قيمة القاعدة.
  const themeSyncedRef = useRef(false)
  const dbTheme = settingsQ.data?.theme
  useEffect(() => {
    if (themeSyncedRef.current) return
    if (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'auto') {
      themeSyncedRef.current = true
      if (dbTheme !== theme.mode) theme.setMode(dbTheme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbTheme])

  // نموذج دعوة مساعد
  const ownId = user?.id ?? ''
  const isOwnerWorkspace = teacher.status === 'ready' && teacher.role === 'owner'
  // فريق السنتر النشط عند العمل مالكاً (0016: لكل سنتر فريقه)، وإلا فريق
  // السنتر الأساسي (القسم لا يظهر إلا في مساحة مالك أصلاً)
  const teamTeacherId = isOwnerWorkspace && activeCentreId ? activeCentreId : ownId
  const membersQ = useTeamMembers(teamTeacherId || undefined, Boolean(ownTeacher))
  const invite = useInviteAssistant(teamTeacherId)
  const inviteByEmail = useInviteAssistantByEmail(teamTeacherId)
  const cancelInvite = useCancelTeamInvite(teamTeacherId)
  const updatePerms = useUpdateMemberPermissions(teamTeacherId)
  const removeMember = useRemoveTeamMember(teamTeacherId)
  const [assistantId, setAssistantId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...ASSISTANT_DEFAULT_PERMISSIONS })
  const [emailPerms, setEmailPerms] = useState<Record<string, boolean>>({ ...ASSISTANT_DEFAULT_PERMISSIONS })
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [emailInviteMsg, setEmailInviteMsg] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  // نموذج إنشاء سنتر جديد (0016)
  const [newCentreName, setNewCentreName] = useState('')
  const [centreMsg, setCentreMsg] = useState<string | null>(null)
  const createCentre = useCreateCentre(ownId)

  // حالة أقسام الإعدادات (W3 — R-11): hooks هنا فوق أي إرجاع مبكر؛
  // تعريفات الأقسام نفسها (قيم عادية) عند الإرجاع حيث تتوفر شروطها
  const [openSections, setOpenSections] = useState<Set<string> | null>(null)
  const [activeSection, setActiveSection] = useState('account')
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const settingsRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (teacher.status !== 'ready') return
    const els = settingsRootRef.current?.querySelectorAll('[data-settings-section]')
    if (!els || els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActiveSection(e.target.getAttribute('data-settings-section') ?? 'account')
          }
        }
      },
      { rootMargin: '-118px 0px -55% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [teacher.status])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status !== 'ready') return <LoadingState label={t('settings.preparing')} />

  const memberships = teacher.memberships

  // صفوف الفريق: أعضاء مربوطون بحساب فعلياً + دعوات بريد معلّقة (بلا حساب بعد)
  const teamRows = membersQ.data ?? []
  const teamMembers = teamRows.filter((m) => m.user_id != null)
  const pendingInvites = teamRows.filter((m) => m.user_id == null && m.status === 'invited')

  const copyMyId = async () => {
    try {
      await navigator.clipboard.writeText(ownId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const switchWorkspace = (teacherId: string | null) => {
    setActiveTeacherId(teacherId)
    void qc.invalidateQueries({ queryKey: ['current-teacher'] })
    navigate('/')
  }

  // إنشاء سنتر جديد (0016) — عند النجاح ننتقل إليه فوراً
  const handleCreateCentre = (e: FormEvent) => {
    e.preventDefault()
    const name = newCentreName.trim()
    if (!name) return
    setCentreMsg(null)
    createCentre.mutate(name, {
      onSuccess: (centre) => {
        setNewCentreName('')
        switchWorkspace(centre.id)
      },
      onError: (err) =>
        setCentreMsg(err instanceof Error ? err.message : t('settings.createCentreFailed')),
    })
  }

  const handleProfileSave = (e: FormEvent) => {
    e.preventDefault()
    if (!managedCentre) return
    setProfileMsg(null)
    updateProfile.mutate(
      {
        display_name: (profileName ?? managedCentre.display_name).trim(),
        phone: (profilePhone ?? managedCentre.phone ?? '').trim() || null,
        avatar_url: (profileAvatar ?? managedCentre.avatar_url ?? '').trim() || null,
      },
      {
        onSuccess: () => setProfileMsg(t('settings.profileSaved')),
        onError: (err) =>
          setProfileMsg(err instanceof Error ? err.message : t('settings.profileSaveFailed')),
      },
    )
  }

  // حمولة إعدادات كاملة من حالة النموذج مع سقوط لقيم القاعدة/الافتراضي —
  // الحفظ في teacher_settings دائماً بكل الحقول القابلة للتحرير معاً.
  const settingsRow = settingsQ.data ?? null
  const settingsPayload = (overrides: Partial<TeacherSettingsInput> = {}): TeacherSettingsInput => ({
    whatsapp_template:
      overrides.whatsapp_template ??
      waTpl ??
      settingsRow?.whatsapp_template ??
      DEFAULT_WA_TEMPLATE,
    center_share_percent:
      overrides.center_share_percent ??
      (centerShare != null && centerShare.trim() !== ''
        ? Number(centerShare)
        : Number(settingsRow?.center_share_percent) || 0),
    reminder_minutes:
      overrides.reminder_minutes ?? reminder ?? settingsRow?.reminder_minutes ?? 0,
    theme: overrides.theme ?? theme.mode,
    brand_name: overrides.brand_name ?? brandName ?? settingsRow?.brand_name ?? null,
    brand_logo_path:
      overrides.brand_logo_path ?? settingsRow?.brand_logo_path ?? null,
    brand_accent:
      overrides.brand_accent ??
      (brandAccent !== undefined ? brandAccent : (settingsRow?.brand_accent ?? null)),
  })

  const handleSettingsSave = (e: FormEvent) => {
    e.preventDefault()
    setSettingsMsg(null)
    const payload = settingsPayload()
    if (
      !Number.isFinite(payload.center_share_percent) ||
      payload.center_share_percent < 0 ||
      payload.center_share_percent > 100
    ) {
      setSettingsMsg(t('settings.centreShareInvalid'))
      return
    }
    if (!payload.whatsapp_template.trim()) {
      setSettingsMsg(t('settings.waTemplateEmpty'))
      return
    }
    updateSettings.mutate(payload, {
      onSuccess: () => setSettingsMsg(t('settings.settingsSaved')),
      onError: (err) =>
        setSettingsMsg(err instanceof Error ? err.message : t('settings.settingsSaveFailed')),
    })
  }

  // حفظ هوية السنتر (الاسم + اللهجة) — الشعار له إجراء فوري منفصل تحت
  const handleBrandSave = (e: FormEvent) => {
    e.preventDefault()
    setBrandMsg(null)
    updateSettings.mutate(settingsPayload(), {
      onSuccess: () => setBrandMsg(t('settings.brandSaved')),
      onError: (err) =>
        setBrandMsg(err instanceof Error ? err.message : t('settings.brandSaveFailed')),
    })
  }

  const handleLogoFile = (file: File | null) => {
    if (!file) return
    setBrandMsg(null)
    setConfirmLogoRemove(false)
    uploadLogo.mutate(file, {
      onSuccess: () => setBrandMsg(t('settings.logoUploaded')),
      onError: (err) =>
        setBrandMsg(err instanceof Error ? err.message : t('settings.logoUploadFailed')),
    })
  }

  const handleLogoRemove = () => {
    setBrandMsg(null)
    removeLogo.mutate(undefined, {
      onSuccess: () => {
        setConfirmLogoRemove(false)
        setBrandMsg(t('settings.logoRemoved'))
      },
      onError: (err) =>
        setBrandMsg(err instanceof Error ? err.message : t('settings.logoRemoveFailed')),
    })
  }

  // اختيار المظهر يطبّق فوراً عبر خطاف الثيم ويُحفظ في القاعدة معه
  const handleThemePick = (mode: ThemeMode) => {
    theme.setMode(mode)
    if (!managedCentre) return
    setSettingsMsg(null)
    updateSettings.mutate(settingsPayload({ theme: mode }), {
      onError: (err) =>
        setSettingsMsg(
          err instanceof Error ? err.message : t('settings.themeSaveFailed'),
        ),
    })
  }

  const handleInvite = (e: FormEvent) => {
    e.preventDefault()
    setInviteMsg(null)
    const id = assistantId.trim()
    if (!UUID_RE.test(id)) {
      setInviteMsg(t('settings.inviteInvalidId'))
      return
    }
    if (id === ownId) {
      setInviteMsg(t('settings.inviteOwnId'))
      return
    }
    invite.mutate(
      { assistantUserId: id, permissions: perms },
      {
        onSuccess: () => {
          setAssistantId('')
          setInviteMsg(t('settings.inviteAdded'))
        },
        onError: (err) =>
          setInviteMsg(err instanceof Error ? err.message : t('settings.inviteAddFailed')),
      },
    )
  }

  const handleEmailInvite = (e: FormEvent) => {
    e.preventDefault()
    setEmailInviteMsg(null)
    const email = normalizeInviteEmail(inviteEmail)
    if (!INVITE_EMAIL_RE.test(email)) {
      setEmailInviteMsg(t('settings.emailInviteInvalid'))
      return
    }
    if (user?.email && email === normalizeInviteEmail(user.email)) {
      setEmailInviteMsg(t('settings.emailInviteOwn'))
      return
    }
    inviteByEmail.mutate(
      { email, permissions: emailPerms },
      {
        onSuccess: () => {
          setInviteEmail('')
          setEmailInviteMsg(
            t('settings.emailInviteCreated'),
          )
        },
        onError: (err) =>
          setEmailInviteMsg(err instanceof Error ? err.message : t('settings.emailInviteFailed')),
      },
    )
  }

  const toggleMemberPerm = (member: TeacherMemberRow, key: string) => {
    const current = (member.permissions ?? {}) as Record<string, unknown>
    const next: Record<string, boolean> = {}
    for (const k of Object.keys(PERMISSION_LABELS)) {
      next[k] = current[k] === true
    }
    next[key] = !next[key]
    updatePerms.mutate(
      { memberId: member.id, permissions: next },
      { onError: () => toast(t('settings.permSaveFailedToast'), 'error') },
    )
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    qc.clear()
    navigate('/login', { replace: true })
  }

  // ——— خريطة أقسام الإعدادات (W3 — R-11) ———
  // الأقسام الظاهرة فعلاً بحسب الشروط نفسها التي تحكم عرض بطاقاتها،
  // بنفس ترتيب الصفحة. على الموبايل: أكورديون (فتح متعدد، حالة محفوظة،
  // الأول مفتوح افتراضياً) + رقائق أنكورز في الشريط الموحّد؛ وعلى
  // الديسكتوب (≥1024px): عمود أنكورز جانبي وكل الأقسام مفتوحة.
  const sectionDefs: SettingsSectionDef[] = [
    { id: 'account', title: t('settings.sectionAccount'), icon: UserRound },
    ...(managedCentre
      ? [
          { id: 'profile', title: t('settings.sectionProfile'), icon: GraduationCap },
          { id: 'app', title: t('settings.sectionApp'), icon: SlidersHorizontal },
          { id: 'brand', title: t('settings.sectionBrand'), icon: Palette },
        ]
      : []),
    ...(ownTeachers.length > 0 || memberships.length > 0
      ? [{ id: 'centres', title: t('settings.sectionCentres'), icon: FolderCog }]
      : []),
    ...(ownTeacher && isOwnerWorkspace
      ? [{ id: 'team', title: t('settings.sectionTeam'), icon: Handshake }]
      : []),
    { id: 'install', title: t('settings.installTitle'), icon: MonitorSmartphone },
    { id: 'push', title: t('settings.pushTitle'), icon: Bell },
    ...(isOwnerWorkspace
      ? [{ id: 'whatsapp', title: t('settings.sectionWhatsapp'), icon: MessageCircle }]
      : []),
    ...(isOwnerWorkspace
      ? [{ id: 'enrol', title: t('settings.sectionEnrol'), icon: CalendarCheck2 }]
      : []),
  ]
  const effectiveOpenSections = isDesktop
    ? new Set(sectionDefs.map((s) => s.id))
    : (openSections ?? new Set(['account']))
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev ?? new Set(['account']))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const jumpToSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev ?? new Set(['account']))
      next.add(id)
      return next
    })
    setActiveSection(id)
    requestAnimationFrame(() => {
      document
        .getElementById(`settings-section-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  const sectionProps = (id: string) => {
    const def = sectionDefs.find((s) => s.id === id)!
    return {
      def,
      open: effectiveOpenSections.has(id),
      onToggle: () => toggleSection(id),
    }
  }

  return (
    <div ref={settingsRootRef}>
      {/* رقائق الأنكورز — موبايل فقط؛ الديسكتوب له العمود الجانبي */}
      <div className="lg:hidden">
        <PageToolBar
          chips={sectionDefs.map((s) => (
            <Chip key={s.id} active={activeSection === s.id} onClick={() => jumpToSection(s.id)}>
              {s.title}
            </Chip>
          ))}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-5 lg:items-start">
        {/* عمود الأنكورز الجانبي — ديسكتوب فقط (R-11) */}
        <aside className="hidden lg:block sticky top-[76px]">
          <div className="flex flex-col gap-1.5">
            {sectionDefs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpToSection(s.id)}
                className={`flex items-center gap-2 min-h-[44px] px-3 rounded-xl border text-[13.5px] font-semibold cursor-pointer text-start ${
                  activeSection === s.id
                    ? 'bg-soft border-primary/40 text-primary'
                    : 'bg-card border-border text-muted hover:bg-soft'
                }`}
              >
                <s.icon size={19} className="shrink-0" />
                {s.title}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
      {/* حسابي */}
      <SettingsSection {...sectionProps('account')}>
        <div className="text-[13.5px] text-muted mb-1">{t('settings.emailLabel')}</div>
        <div className="font-semibold mb-3 break-all" dir="ltr" style={{ textAlign: 'start' }}>
          {user?.email ?? '—'}
        </div>
        <div className="text-[13.5px] text-muted mb-1">
          {t('settings.accountIdLabel')}
        </div>
        <div className="flex items-center gap-2 mb-1">
          <code className="flex-1 text-[12px] bg-soft rounded-xl px-2 py-2 overflow-hidden text-ellipsis whitespace-nowrap" dir="ltr">
            {ownId}
          </code>
          <Button variant="soft" onClick={copyMyId} className="min-h-[48px] px-3 text-[13.5px]">
            {copied ? (<><Check size={18} /> {t('settings.copied')}</>) : t('settings.copy')}
          </Button>
        </div>
        <div className="text-[13.5px] text-muted mt-2 mb-0">
          {t('settings.currentRoleLabel')}{' '}
          <b className="text-text">
            {teacher.role === 'owner' ? t('settings.roleOwner') : t('settings.roleAssistant')}
          </b>
        </div>
      </SettingsSection>

      {/* ملف المدرس — بيانات السنتر المُدار (النشط إن كان مملوكاً) */}
      {managedCentre && (
        <SettingsSection {...sectionProps('profile')}>
          {profileMsg && <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{profileMsg}</p>}
          <form onSubmit={handleProfileSave}>
            <Field label={t('settings.teacherNameLabel')}>
              <TextInput
                value={profileName ?? managedCentre.display_name}
                onChange={(e) => setProfileName(e.target.value)}
                required
              />
            </Field>
            <Field label={t('settings.phoneLabel')}>
              <TextInput
                type="tel"
                dir="ltr"
                value={profilePhone ?? managedCentre.phone ?? ''}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="01xxxxxxxxx"
              />
            </Field>
            <Field label={t('settings.avatarUrlLabel')}>
              <TextInput
                type="url"
                dir="ltr"
                value={profileAvatar ?? managedCentre.avatar_url ?? ''}
                onChange={(e) => setProfileAvatar(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            {(profileAvatar ?? managedCentre.avatar_url) && (
              <div className="flex items-center gap-2 mb-3">
                <img
                  src={profileAvatar ?? managedCentre.avatar_url ?? ''}
                  alt={t('settings.teacherPhotoAlt')}
                  className="w-10 h-10 rounded-full object-cover border border-border"
                />
                <span className="text-muted text-[12px]">{t('settings.photoPreview')}</span>
              </div>
            )}
            <Button full type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? t('settings.saving') : t('settings.save')}
            </Button>
          </form>
        </SettingsSection>
      )}

      {/* إعدادات التطبيق — teacher_settings كاملة (الخطوة 10) */}
      {managedCentre && (
        <SettingsSection {...sectionProps('app')}>
          {settingsQ.isPending ? (
            <LoadingState label={t('settings.loadingSettingsForm')} />
          ) : settingsQ.isError ? (
            <ErrorState
              message={
                settingsQ.error instanceof Error ? settingsQ.error.message : t('common.unknownError')
              }
              onRetry={() => void settingsQ.refetch()}
            />
          ) : (
            <form onSubmit={handleSettingsSave}>
              <Field label={t('settings.waTemplateLabel')}>
                <TextArea
                  rows={3}
                  value={waTpl ?? settingsRow?.whatsapp_template ?? DEFAULT_WA_TEMPLATE}
                  onChange={(e) => setWaTpl(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-1.5 mb-4 -mt-1">
                {WA_TEMPLATE_VARS.map((v) => (
                  <code
                    key={v}
                    dir="ltr"
                    className="text-[12px] bg-soft text-primary rounded-full px-2 py-0.5 font-semibold"
                  >
                    {v}
                  </code>
                ))}
              </div>

              <Field label={t('settings.centreShareLabel')}>
                <TextInput
                  type="number"
                  dir="ltr"
                  min={0}
                  max={100}
                  step="0.5"
                  value={
                    centerShare ?? String(Number(settingsRow?.center_share_percent) || 0)
                  }
                  onChange={(e) => setCenterShare(e.target.value)}
                />
              </Field>

              <div className="mb-4">
                <div className="text-[13.5px] text-muted font-semibold mb-2">
                  {t('settings.reminderLabel')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {REMINDER_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.minutes}
                      active={(reminder ?? settingsRow?.reminder_minutes ?? 0) === opt.minutes}
                      onClick={() => setReminder(opt.minutes)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.themeLabel')}</div>
                <div className="flex flex-wrap gap-2">
                  {THEME_MODES.map((opt) => (
                    <Chip
                      key={opt.code}
                      active={theme.mode === opt.code}
                      onClick={() => handleThemePick(opt.code)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
                <p className="text-muted text-[12px] mb-0 mt-2">
                  {t('settings.themeHint')}
                </p>
              </div>

              <div className="text-[13.5px] text-muted mb-3">
                {t('settings.lastExportLabel')}{' '}
                <b className="text-text">
                  {settingsRow?.last_export_at
                    ? formatDateLabel(settingsRow.last_export_at.slice(0, 10))
                    : t('settings.noExportYet')}
                </b>{' '}
                — <Link to="/backup" className="text-primary font-semibold">{t('settings.backup')}</Link>
              </div>

              {settingsMsg && (
                <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{settingsMsg}</p>
              )}
              <Button full type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? t('settings.saving') : t('settings.saveSettings')}
              </Button>
            </form>
          )}
        </SettingsSection>
      )}

      {/* هوية السنتر — الهوية البيضاء (Phase 3 خطوة 1، migration ‏0008):
          للمالك فقط (teacher_settings بلا سياسة مساعد أصلاً). الاسم
          والشعار ولون اللهجة يظهرون على كارت الطالب والإيصالات وأوراق
          الامتحان وبوابة ولي الأمر — وغياب أي عنصر يسقط للافتراضي. */}
      {managedCentre && (
        <SettingsSection {...sectionProps('brand')}>
          <p className="text-muted text-[13.5px] mt-0 mb-3">
            {t('settings.brandIntro')}
          </p>
          {settingsQ.isPending ? (
            <LoadingState label={t('settings.loadingBrand')} />
          ) : settingsQ.isError ? (
            <ErrorState
              message={
                settingsQ.error instanceof Error ? settingsQ.error.message : t('common.unknownError')
              }
              onRetry={() => void settingsQ.refetch()}
            />
          ) : (
            <>
              {/* الشعار — رفع/استبدال/حذف فوري مع معاينة */}
              <div className="flex items-center gap-3 mb-3">
                {settingsRow?.brand_logo_path && brandLogoUrl(settingsRow.brand_logo_path) ? (
                  <img
                    src={brandLogoUrl(settingsRow.brand_logo_path) ?? ''}
                    alt={t('settings.centreLogoAlt')}
                    className="w-16 h-16 rounded-2xl object-contain bg-soft border border-border p-1 shrink-0"
                  />
                ) : (
                  <span className="shrink-0">
                    <Logo size={56} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">
                    {settingsRow?.brand_logo_path ? t('settings.logoCurrent') : t('settings.logoNone')}
                  </div>
                  <div className="text-muted text-[12px]">
                    {t('settings.logoHint')}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mb-4">
                <label className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-on-primary font-semibold text-[15px] cursor-pointer px-3">
                  <ImagePlus size={20} />
                  {uploadLogo.isPending
                    ? t('settings.uploading')
                    : settingsRow?.brand_logo_path
                      ? t('settings.logoReplace')
                      : t('settings.logoUpload')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadLogo.isPending}
                    onChange={(e) => {
                      handleLogoFile(e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                </label>
                {settingsRow?.brand_logo_path &&
                  (confirmLogoRemove ? (
                    <>
                      <Button
                        variant="danger"
                        className="min-h-[48px] text-[13.5px]"
                        disabled={removeLogo.isPending}
                        onClick={handleLogoRemove}
                      >
                        {t('settings.confirmDelete')}
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-[48px] text-[13.5px]"
                        onClick={() => setConfirmLogoRemove(false)}
                      >
                        {t('settings.undo')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      className="min-h-[48px] text-[13.5px] text-bad-text"
                      onClick={() => setConfirmLogoRemove(true)}
                    >
                      <Trash2 size={18} /> {t('settings.delete')}
                    </Button>
                  ))}
              </div>

              <form onSubmit={handleBrandSave}>
                <Field label={t('settings.brandNameLabel')}>
                  <TextInput
                    value={brandName ?? settingsRow?.brand_name ?? ''}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder={t('settings.brandNamePlaceholder')}
                    maxLength={80}
                  />
                </Field>

                <div className="mb-4">
                  <div className="text-[13.5px] text-muted font-semibold mb-2">
                    {t('settings.accentLabel')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_PRESETS.map((p) => {
                      const active =
                        (brandAccent !== undefined
                          ? brandAccent
                          : settingsRow?.brand_accent) === p.hex
                      return (
                        <button
                          key={p.hex}
                          type="button"
                          title={p.label}
                          aria-label={p.label}
                          onClick={() => setBrandAccent(p.hex)}
                          className={`w-[48px] h-[48px] rounded-full border-2 cursor-pointer flex items-center justify-center ${
                            active ? 'border-text' : 'border-border'
                          }`}
                          style={{ background: p.hex }}
                        >
                          {active && <Check size={20} color="#fff" />}
                        </button>
                      )
                    })}
                    <label
                      className="inline-flex items-center gap-2 min-h-[48px] px-3 rounded-full border border-border cursor-pointer text-[13.5px] font-semibold"
                      title={t('settings.customColorTitle')}
                    >
                      <input
                        type="color"
                        className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                        value={
                          (brandAccent !== undefined
                            ? brandAccent
                            : settingsRow?.brand_accent) ?? '#4f46e5'
                        }
                        onChange={(e) => setBrandAccent(e.target.value.toLowerCase())}
                      />
                      {t('settings.custom')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setBrandAccent(null)}
                      className={`px-3 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer ${
                        (brandAccent !== undefined
                          ? brandAccent
                          : settingsRow?.brand_accent) == null
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-card text-muted border-border'
                      }`}
                    >
                      {t('settings.accentDefault')}
                    </button>
                  </div>
                  <p className="text-muted text-[12px] mb-0 mt-2">
                    {t('settings.accentHint')}
                  </p>
                </div>

                {brandMsg && (
                  <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{brandMsg}</p>
                )}
                <Button full type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? t('settings.saving') : t('settings.saveBrand')}
                </Button>
              </form>
            </>
          )}
        </SettingsSection>
      )}

      {/* السناتر ومساحات العمل (0016) — مبدّل السنتر: كل سناترك المملوكة
          (مالك) + عضوياتك عند مدرسين آخرين (مساعد)، وإنشاء سنتر جديد.
          بيانات وهوية وإعدادات كل سنتر منفصلة تماماً بـ teacher_id. */}
      {(ownTeachers.length > 0 || memberships.length > 0) && (
        <SettingsSection {...sectionProps('centres')}>
          <p className="text-muted text-[13.5px] mt-0 mb-3">
            {t('settings.centresIntro')}
          </p>
          {ownTeachers.map((tok) => {
            const active = activeCentreId === tok.id
            return (
              <button
                key={tok.id}
                type="button"
                onClick={() => switchWorkspace(tok.id)}
                className={`w-full flex items-center gap-2 px-3 min-h-[48px] rounded-xl border cursor-pointer mb-2 text-start ${
                  active ? 'border-primary bg-soft font-bold' : 'border-border bg-card'
                }`}
              >
                <span className="flex-1">{tok.display_name || t('settings.centreNoName')}</span>
                <span className="text-muted text-[12px]">{t('settings.ownerBadge')}</span>
                {active && <span className="text-primary text-[13.5px]">{t('settings.currentBadge')}</span>}
              </button>
            )
          })}
          {memberships.map((m) => {
            const active = activeCentreId === m.teacher_id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => switchWorkspace(m.teacher_id)}
                className={`w-full flex items-center gap-2 px-3 min-h-[48px] rounded-xl border cursor-pointer mb-2 text-start ${
                  active ? 'border-primary bg-soft font-bold' : 'border-border bg-card'
                }`}
              >
                <span className="flex-1">
                  {t('settings.assistantAtTeacher')} <span dir="ltr">{shortId(m.teacher_id)}</span>
                </span>
                <span className="text-muted text-[12px]">{t('settings.assistantBadge')}</span>
                {active && <span className="text-primary text-[13.5px]">{t('settings.currentBadge')}</span>}
              </button>
            )
          })}

          {/* إنشاء سنتر جديد لنفس الحساب — يبدأ فاضياً بإعدادات افتراضية
              وننتقل إليه فوراً */}
          {user && (
            <form onSubmit={handleCreateCentre} className="mt-4 border-t border-border pt-4">
              <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.createCentreTitle')}</div>
              <Field label={t('settings.newCentreNameLabel')}>
                <TextInput
                  value={newCentreName}
                  onChange={(e) => setNewCentreName(e.target.value)}
                  placeholder={t('settings.newCentrePlaceholder')}
                  required
                />
              </Field>
              {centreMsg && (
                <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{centreMsg}</p>
              )}
              <Button full type="submit" disabled={createCentre.isPending || !newCentreName.trim()}>
                {createCentre.isPending ? t('settings.creating') : t('settings.createCentreAction')}
              </Button>
            </form>
          )}
        </SettingsSection>
      )}

      {/* فريق العمل — للمالك في مساحته فقط */}
      {ownTeacher && isOwnerWorkspace && (
        <SettingsSection {...sectionProps('team')}>
          <p className="text-muted text-[13.5px] mt-0 mb-3">
            {t('settings.teamIntro')}
          </p>

          <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.emailInviteTitle')}</div>
          <form onSubmit={handleEmailInvite} className="mb-4">
            <Field label={t('settings.assistantEmailLabel')}>
              <TextInput
                type="email"
                dir="ltr"
                placeholder="assistant@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </Field>
            {INVITE_EMAIL_RE.test(normalizeInviteEmail(inviteEmail)) && (
              <a
                className="inline-flex items-center gap-1.5 min-h-[48px] text-primary text-[13.5px] font-semibold mb-3 -mt-1"
                href={`mailto:${normalizeInviteEmail(inviteEmail)}?subject=${encodeURIComponent(
                  t('settings.inviteEmailSubject'),
                )}&body=${encodeURIComponent(
                  t('settings.inviteEmailBody'),
                )}`}
              >
                <Mail size={18} />
                {t('settings.notifyByEmail')}
              </a>
            )}
            <div className="mb-3">
              <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.assistantPermsLabel')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PERMISSION_LABELS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEmailPerms((p) => ({ ...p, [key]: !p[key] }))}
                    className={`px-3 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer ${
                      emailPerms[key]
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-card text-muted border-border'
                    }`}
                  >
                    {PERMISSION_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
            {emailInviteMsg && (
              <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{emailInviteMsg}</p>
            )}
            <Button full type="submit" disabled={inviteByEmail.isPending}>
              {inviteByEmail.isPending ? t('settings.creatingInvite') : t('settings.sendInvite')}
            </Button>
          </form>

          {pendingInvites.length > 0 && (
            <div className="mb-4">
              <div className="text-[13.5px] text-muted font-semibold mb-2">
                {t('settings.pendingInvitesTitle', { count: pendingInvites.length })}
              </div>
              {pendingInvites.map((inv) => {
                const invPerms = (inv.permissions ?? {}) as Record<string, unknown>
                return (
                  <div key={inv.id} className="border border-border rounded-xl p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[15px] flex-1 min-w-0 break-all" dir="ltr" style={{ textAlign: 'start' }}>
                        {inv.invited_email}
                      </span>
                      <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                        {t('settings.pendingBadge')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {Object.keys(PERMISSION_LABELS)
                        .filter((key) => invPerms[key] === true)
                        .map((key) => (
                          <span
                            key={key}
                            className="px-2 py-1 rounded-full border border-border bg-soft text-[12px] font-semibold"
                          >
                            {PERMISSION_LABELS[key]}
                          </span>
                        ))}
                    </div>
                    {confirmCancelId === inv.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="danger"
                          className="flex-1 min-h-[48px] text-[13.5px]"
                          disabled={cancelInvite.isPending}
                          onClick={() =>
                            cancelInvite.mutate(inv.id, {
                              onSuccess: () => setConfirmCancelId(null),
                            })
                          }
                        >
                          {t('settings.confirmCancelInvite')}
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 min-h-[48px] text-[13.5px]"
                          onClick={() => setConfirmCancelId(null)}
                        >
                          {t('settings.undo')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="min-h-[48px] text-[13.5px] text-bad-text"
                        onClick={() => setConfirmCancelId(inv.id)}
                      >
                        {t('settings.cancelInvite')}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.addByIdTitle')}</div>
          <form onSubmit={handleInvite} className="mb-4">
            <Field label={t('settings.assistantIdLabel')}>
              <TextInput
                dir="ltr"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
                required
              />
            </Field>
            <div className="mb-3">
              <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.assistantPermsLabel')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PERMISSION_LABELS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPerms((p) => ({ ...p, [key]: !p[key] }))}
                    className={`px-3 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer ${
                      perms[key]
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-card text-muted border-border'
                    }`}
                  >
                    {PERMISSION_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
            {inviteMsg && (
              <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{inviteMsg}</p>
            )}
            <Button full type="submit" disabled={invite.isPending}>
              {invite.isPending ? t('settings.adding') : t('settings.addAssistant')}
            </Button>
          </form>

          <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.teamMembersTitle')}</div>
          {membersQ.isPending ? (
            <LoadingState label={t('settings.loadingTeam')} />
          ) : membersQ.isError ? (
            <ErrorState
              message={membersQ.error instanceof Error ? membersQ.error.message : t('common.unknownError')}
              onRetry={() => void membersQ.refetch()}
            />
          ) : teamMembers.length === 0 ? (
            <EmptyState icon={Handshake} title={t('settings.teamEmptyTitle')} hint={t('settings.teamEmptyHint')} />
          ) : (
            teamMembers.map((m) => {
              const memberPerms = (m.permissions ?? {}) as Record<string, unknown>
              return (
                <div key={m.id} className="border border-border rounded-xl p-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[15px] flex-1">
                      {m.invited_email ? (
                        <>{t('settings.memberAssistantPrefix')} <span dir="ltr">{m.invited_email}</span></>
                      ) : (
                        <>{t('settings.memberAssistantPrefix')} <span dir="ltr">{shortId(m.user_id ?? '')}</span></>
                      )}
                    </span>
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                      {m.status === 'active' ? t('settings.statusActive') : m.status === 'invited' ? t('settings.statusInvited') : t('settings.statusSuspended')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {Object.keys(PERMISSION_LABELS).map((key) => {
                      const on = memberPerms[key] === true
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={updatePerms.isPending}
                          onClick={() => toggleMemberPerm(m, key)}
                          className={`px-2 min-h-[48px] rounded-full border text-[13.5px] font-semibold cursor-pointer ${
                            on
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-card text-muted border-border'
                          }`}
                        >
                          {PERMISSION_LABELS[key]}
                        </button>
                      )
                    })}
                  </div>
                  {confirmRemoveId === m.id ? (
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        className="flex-1 min-h-[48px] text-[13.5px]"
                        disabled={removeMember.isPending}
                        onClick={() =>
                          removeMember.mutate(m.id, {
                            onSuccess: () => setConfirmRemoveId(null),
                          })
                        }
                      >
                        {t('settings.confirmRemoveMember')}
                      </Button>
                      <Button
                        variant="ghost"
                        className="flex-1 min-h-[48px] text-[13.5px]"
                        onClick={() => setConfirmRemoveId(null)}
                      >
                        {t('settings.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      className="min-h-[48px] text-[13.5px] text-bad-text"
                      onClick={() => setConfirmRemoveId(m.id)}
                    >
                      {t('settings.removeFromTeam')}
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </SettingsSection>
      )}

      {/* تثبيت التطبيق (PWA — خطوة 11) — بطاقة مكوّن قائمة: bare */}
      <SettingsSection {...sectionProps('install')} bare>
        <InstallAppCard />
      </SettingsSection>

      {/* إشعارات Push (Phase 4) — بطاقة مكوّن قائمة: bare */}
      <SettingsSection {...sectionProps('push')} bare>
        <PushNotificationsCard />
      </SettingsSection>

      {/* واتساب الاختياري per-teacher (3A-300 — 0026): البطاقة مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('whatsapp')} bare>
          <WhatsAppSettingsCard />
        </SettingsSection>
      )}

      {/* صفحة الحجز العامة (Phase 5 — خطوة 2): البطاقة نفسها مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('enrol')} bare>
          <EnrolLinkCard />
        </SettingsSection>
      )}

      {/* تسجيل الخروج */}
      <Card>
        <Button full variant="danger" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? t('settings.signingOut') : t('settings.signOut')}
        </Button>
      </Card>
        </div>
      </div>
    </div>
  )
}
