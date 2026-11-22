import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Field, TextInput } from '../../../components/ui/form'
import type { TeacherMemberRow, TeacherRow } from '../../../types/database'
import type { useCreateCentre } from '../../auth/hooks'
import { shortId } from './helpers'
import { t } from '../../../i18n'

/** محتوى قسم «السناتر ومساحات العمل» — مبدّل السنتر + إنشاء سنتر جديد */
export function CentresSection({
  ownTeachers,
  memberships,
  activeCentreId,
  switchWorkspace,
  user,
  newCentreName,
  setNewCentreName,
  centreMsg,
  handleCreateCentre,
  createCentre,
}: {
  ownTeachers: TeacherRow[]
  memberships: TeacherMemberRow[]
  activeCentreId: string | null
  switchWorkspace: (teacherId: string | null) => void
  user: { email?: string | null } | null
  newCentreName: string
  setNewCentreName: Dispatch<SetStateAction<string>>
  centreMsg: string | null
  handleCreateCentre: (e: FormEvent) => void
  createCentre: ReturnType<typeof useCreateCentre>
}) {
  return (
    <>
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
            <Plus size={18} />
            {createCentre.isPending ? t('settings.creating') : t('settings.createCentreAction')}
          </Button>
        </form>
      )}
    </>
  )
}
