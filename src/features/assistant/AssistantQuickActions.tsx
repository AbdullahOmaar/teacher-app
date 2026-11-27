import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui/Button'
import { t } from '../../i18n'
import { fetchAssistantGroups } from './apiAssistant'

// ============================================================================
// إجراءات سريعة للمساعد (3A-924 — مرحلة الأساس الحتمي الأولى: قوائم
// وأزرار بمعاملات مختارة بدل الاعتماد على الصياغة الحرة). الأزرار
// ترسل عبارات عربية منمّطة يفهمها المخطط الحتمي ومخطط المزوّد معاً،
// أو تملأ صندوق الكتابة بقالب قابل للتحرير قبل الإرسال (إضافة طالب/
// توليد حصص). لا تنفيذ من الزر نفسه أبداً: كل إرسال يمر بمسار
// المحادثة وآلة التأكيد نفسها (القراءات مباشرة، والكتابات اقتراح).
// ============================================================================

type GroupPickerKind = 'homework' | 'sessions' | 'generate'

interface AssistantQuickActionsProps {
  teacherId: string
  disabled: boolean
  onSend: (text: string) => void
  onPrefill: (text: string) => void
}

export function AssistantQuickActions({
  teacherId,
  disabled,
  onSend,
  onPrefill,
}: AssistantQuickActionsProps) {
  const [picker, setPicker] = useState<GroupPickerKind | null>(null)

  const groupsQ = useQuery({
    queryKey: ['assistant-groups', teacherId],
    queryFn: () => fetchAssistantGroups(teacherId),
    enabled: Boolean(teacherId) && picker !== null,
    staleTime: 60_000,
    retry: false,
  })
  const groups = groupsQ.data ?? []

  const togglePicker = (kind: GroupPickerKind) =>
    setPicker((prev) => (prev === kind ? null : kind))

  const pickGroup = (name: string) => {
    if (picker === 'homework') onSend(t('assistant.quickHomeworkText', { name }))
    else if (picker === 'sessions') onSend(t('assistant.quickSessionsText', { name }))
    else if (picker === 'generate') onPrefill(t('assistant.quickGenerateText', { name }))
    setPicker(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-[12.5px] mt-0 mb-0">{t('assistant.quickTitle')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => onSend(t('assistant.quickUnpaidText'))}
        >
          {t('assistant.quickUnpaid')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => onSend(t('assistant.quickAbsenceText'))}
        >
          {t('assistant.quickAbsence')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => onSend(t('assistant.quickCollectionText'))}
        >
          {t('assistant.quickCollection')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => togglePicker('homework')}
        >
          {t('assistant.quickHomework')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => togglePicker('sessions')}
        >
          {t('assistant.quickSessions')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => togglePicker('generate')}
        >
          {t('assistant.quickGenerate')}
        </Button>
        <Button
          size="sm"
          variant="soft"
          disabled={disabled}
          onClick={() => onPrefill(t('assistant.quickAddStudentPrefix'))}
        >
          {t('assistant.quickAddStudent')}
        </Button>
      </div>
      {picker !== null && (
        <div className="flex flex-col gap-2 bg-soft rounded-xl px-3 py-2">
          <p className="text-[12.5px] text-muted mt-0 mb-0">{t('assistant.quickPickGroup')}</p>
          {groupsQ.isLoading ? (
            <p className="text-[13px] mt-0 mb-0">{t('assistant.keyLoading')}</p>
          ) : groups.length === 0 ? (
            <p className="text-[13px] mt-0 mb-0">{t('assistant.quickNoGroups')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <Button
                  key={g.id}
                  size="sm"
                  variant="soft"
                  disabled={disabled}
                  onClick={() => pickGroup(g.name)}
                >
                  {g.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
