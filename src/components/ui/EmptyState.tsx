interface EmptyStateProps {
  icon?: string
  title: string
  hint?: string
}

/** حالة الفراغ — أيقونة كبيرة + عنوان + إرشاد رمادي (المرجع §6.5) */
export function EmptyState({ icon = '🗂️', title, hint }: EmptyStateProps) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-[32px] mb-2">{icon}</div>
      <div className="font-extrabold mb-1">{title}</div>
      {hint && <div className="text-muted text-[13px]">{hint}</div>}
    </div>
  )
}
