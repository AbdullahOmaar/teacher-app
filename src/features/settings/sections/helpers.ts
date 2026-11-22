// مساعدات مشتركة بين أقسام صفحة الإعدادات (الدفعة #7 / 3A-360 — COD-2).

export function shortId(id: string) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}
