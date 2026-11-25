import { invalidatePrefixes } from '../../lib/invalidate'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Bell, CalendarCheck2, FolderCog, GraduationCap, Handshake, Info, MessageCircle, MonitorSmartphone, NotebookPen, Palette, SlidersHorizontal, Sparkles, UserRound } from 'lucide-react'
import { PageToolBar } from '../../components/ui/PageToolBar'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/form'
import { LoadingState } from '../../components/ui/states'
import { useAuth } from '../../lib/useAuth'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { hasExplicitThemeChoice, useTheme, type ThemeMode } from '../../hooks/useTheme'
import { setActiveTeacherId } from '../../lib/activeTeacher'
import { versionStampLine } from '../../lib/buildInfo'
import { copyText } from '../../lib/clipboard'
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
import { MascotSettingsCard } from './MascotSettingsCard'
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard'
import { AssistantKeyCard } from './AssistantKeyCard'
import { DeleteAccountCard } from './DeleteAccountCard'
import { DEMO_EMAIL } from '../auth/api'
import { type TeacherSettingsInput } from './api'
import {
  useRemoveBrandLogo,
  useTeacherSettings,
  useUpdateTeacherSettings,
  useUploadBrandLogo,
} from './hooks'
import type { TeacherMemberRow } from '../../types/database'
import { SettingsSection, type SettingsSectionDef } from './sections/SettingsSection'
import { AccountSection } from './sections/AccountSection'
import { ProfileSection } from './sections/ProfileSection'
import { AppSettingsSection } from './sections/AppSettingsSection'
import { BrandSection } from './sections/BrandSection'
import { CentresSection } from './sections/CentresSection'
import { TeamSection } from './sections/TeamSection'
import { t } from '../../i18n'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // مزامنة الثيم من القاعدة مرة واحدة عند تحميل الإعدادات — بشروط
  // 3A-384 (ملاحظة المالك ٧ «التطبيق بيطلع من الدارك مود لوحده»):
  // قيمة القاعدة تُعتمد فقط على جهاز بلا اختيار محلي صريح (نقل
  // الاختيار بين أجهزة المدرس)؛ أي اختيار صريح على هذا الجهاز —
  // من الشريط العلوي أو من هنا — يسود دائماً ولا يُفرض عليه شيء.
  const themeSyncedRef = useRef(false)
  const dbTheme = settingsQ.data?.theme
  useEffect(() => {
    if (themeSyncedRef.current) return
    if (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'auto') {
      themeSyncedRef.current = true
      if (!hasExplicitThemeChoice() && dbTheme !== theme.mode) theme.setMode(dbTheme)
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
    if (await copyText(ownId)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopied(false)
    }
  }

  const switchWorkspace = (teacherId: string | null) => {
    setActiveTeacherId(teacherId)
    void invalidatePrefixes(qc, ['current-teacher'])
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
      ? [{ id: 'mascot', title: t('settings.sectionMascot'), icon: NotebookPen }]
      : []),
    ...(isOwnerWorkspace
      ? [{ id: 'whatsapp', title: t('settings.sectionWhatsapp'), icon: MessageCircle }]
      : []),
    ...(isOwnerWorkspace
      ? [{ id: 'assistant', title: t('settings.sectionAssistant'), icon: Sparkles }]
      : []),
    ...(isOwnerWorkspace
      ? [{ id: 'enrol', title: t('settings.sectionEnrol'), icon: CalendarCheck2 }]
      : []),
    { id: 'about', title: t('settings.sectionAbout'), icon: Info },
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
        <AccountSection
          user={user}
          ownId={ownId}
          copied={copied}
          copyMyId={copyMyId}
          role={teacher.role}
        />
      </SettingsSection>

      {/* ملف المدرس — بيانات السنتر المُدار (النشط إن كان مملوكاً) */}
      {managedCentre && (
        <SettingsSection {...sectionProps('profile')}>
          <ProfileSection
            managedCentre={managedCentre}
            profileMsg={profileMsg}
            profileName={profileName}
            profilePhone={profilePhone}
            profileAvatar={profileAvatar}
            setProfileName={setProfileName}
            setProfilePhone={setProfilePhone}
            setProfileAvatar={setProfileAvatar}
            handleProfileSave={handleProfileSave}
            updateProfile={updateProfile}
          />
        </SettingsSection>
      )}

      {/* إعدادات التطبيق — teacher_settings كاملة (الخطوة 10) */}
      {managedCentre && (
        <SettingsSection {...sectionProps('app')}>
          <AppSettingsSection
            settingsQ={settingsQ}
            settingsRow={settingsRow}
            waTpl={waTpl}
            setWaTpl={setWaTpl}
            centerShare={centerShare}
            setCenterShare={setCenterShare}
            reminder={reminder}
            setReminder={setReminder}
            theme={theme}
            handleThemePick={handleThemePick}
            settingsMsg={settingsMsg}
            handleSettingsSave={handleSettingsSave}
            updateSettings={updateSettings}
          />
        </SettingsSection>
      )}

      {/* هوية السنتر — الهوية البيضاء (Phase 3 خطوة 1، migration ‏0008):
          للمالك فقط (teacher_settings بلا سياسة مساعد أصلاً). الاسم
          والشعار ولون اللهجة يظهرون على كارت الطالب والإيصالات وأوراق
          الامتحان وبوابة ولي الأمر — وغياب أي عنصر يسقط للافتراضي. */}
      {managedCentre && (
        <SettingsSection {...sectionProps('brand')}>
          <BrandSection
            settingsQ={settingsQ}
            settingsRow={settingsRow}
            brandName={brandName}
            setBrandName={setBrandName}
            brandAccent={brandAccent}
            setBrandAccent={setBrandAccent}
            brandMsg={brandMsg}
            confirmLogoRemove={confirmLogoRemove}
            setConfirmLogoRemove={setConfirmLogoRemove}
            uploadLogo={uploadLogo}
            removeLogo={removeLogo}
            handleBrandSave={handleBrandSave}
            handleLogoFile={handleLogoFile}
            handleLogoRemove={handleLogoRemove}
            updateSettings={updateSettings}
          />
        </SettingsSection>
      )}

      {/* السناتر ومساحات العمل (0016) — مبدّل السنتر: كل سناترك المملوكة
          (مالك) + عضوياتك عند مدرسين آخرين (مساعد)، وإنشاء سنتر جديد.
          بيانات وهوية وإعدادات كل سنتر منفصلة تماماً بـ teacher_id. */}
      {(ownTeachers.length > 0 || memberships.length > 0) && (
        <SettingsSection {...sectionProps('centres')}>
          <CentresSection
            ownTeachers={ownTeachers}
            memberships={memberships}
            activeCentreId={activeCentreId}
            switchWorkspace={switchWorkspace}
            user={user}
            newCentreName={newCentreName}
            setNewCentreName={setNewCentreName}
            centreMsg={centreMsg}
            handleCreateCentre={handleCreateCentre}
            createCentre={createCentre}
          />
        </SettingsSection>
      )}

      {/* فريق العمل — للمالك في مساحته فقط */}
      {ownTeacher && isOwnerWorkspace && (
        <SettingsSection {...sectionProps('team')}>
          <TeamSection
            teamMembers={teamMembers}
            pendingInvites={pendingInvites}
            membersQ={membersQ}
            inviteMsg={inviteMsg}
            emailInviteMsg={emailInviteMsg}
            assistantId={assistantId}
            setAssistantId={setAssistantId}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            perms={perms}
            setPerms={setPerms}
            emailPerms={emailPerms}
            setEmailPerms={setEmailPerms}
            confirmRemoveId={confirmRemoveId}
            setConfirmRemoveId={setConfirmRemoveId}
            confirmCancelId={confirmCancelId}
            setConfirmCancelId={setConfirmCancelId}
            handleInvite={handleInvite}
            handleEmailInvite={handleEmailInvite}
            invite={invite}
            inviteByEmail={inviteByEmail}
            cancelInvite={cancelInvite}
            removeMember={removeMember}
            updatePerms={updatePerms}
            toggleMemberPerm={toggleMemberPerm}
          />
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

      {/* الماسكوت دُفّي (MASCOT-PLAN §٦ — 0028): البطاقة مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('mascot')} bare>
          <MascotSettingsCard />
        </SettingsSection>
      )}

      {/* واتساب الاختياري per-teacher (3A-300 — 0026): البطاقة مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('whatsapp')} bare>
          <WhatsAppSettingsCard />
        </SettingsSection>
      )}

      {/* مفتاح مزوّد الذكاء BYOK (T6 — 0049): البطاقة مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('assistant')} bare>
          <AssistantKeyCard />
        </SettingsSection>
      )}

      {/* صفحة الحجز العامة (Phase 5 — خطوة 2): البطاقة نفسها مالك فقط */}
      {isOwnerWorkspace && (
        <SettingsSection {...sectionProps('enrol')} bare>
          <EnrolLinkCard />
        </SettingsSection>
      )}

      {/* حول التطبيق (قاعدة المالك 2026-11-25، امتداد 3A-312): الاسم +
          سطر ختم الإصدار ووقت النشر الموحّد من بيانات البناء عبر
          lib/buildInfo — تحديث الرقم في package.json يحدّث العرض تلقائياً */}
      <SettingsSection {...sectionProps('about')}>
        <div className="flex flex-col gap-1">
          <span className="font-bold text-[15px]">{t('shell.appName')}</span>
          <span className="text-muted text-[13.5px]">{versionStampLine()}</span>
        </div>
      </SettingsSection>

      {/* حذف الحساب (فجوة 32 — مهمة Phase 2 رقم 3): مالك فقط، ومخفٍ عن
          الحساب التجريبي العام (حارس الخادم في 0046 هو الضمان الحقيقي) */}
      {isOwnerWorkspace && user?.email !== DEMO_EMAIL && <DeleteAccountCard />}

      {/* تسجيل الخروج */}
      <Card className="rise-in">
        <Button full variant="danger" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? t('settings.signingOut') : t('settings.signOut')}
        </Button>
      </Card>
        </div>
      </div>
    </div>
  )
}
