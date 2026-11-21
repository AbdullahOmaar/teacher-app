-- ============================================================================
-- 0027 — تشديد منح التنفيذ على دوال واتساب الداخلية (إصلاح اختبار حي)
-- ----------------------------------------------------------------------------
-- اكتشفته اختبارات authz الموسّعة في 0026: صلاحيات Supabase الافتراضية
-- (default privileges) تمنح EXECUTE على الدوال الجديدة لـ anon و
-- authenticated مباشرة، و revoke ... from public في 0026 لا يزيل منح
-- الأدوار المباشرة. النتيجة قبل هذا الإصلاح: resolve_whatsapp_channel_
-- internal و get_teacher_whatsapp_token_internal قابلتان للتنفيذ من
-- أي عميل — والدالتان بلا حارس auth.uid() داخلي لأنهما مصممتان
-- لمستدعي service role أصلاً، فالمنح هي الحارس الوحيد.
-- الإصلاح: سحب صريح من anon و authenticated وإبقاء service_role وحده.
-- set_teacher_whatsapp_token يبقى لـ authenticated (مسار كتابة المالك
-- وبداخله حارس ملكية يعمل مع auth.uid()) ويُسحب من anon فقط.
-- ============================================================================

revoke execute on function public.resolve_whatsapp_channel_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_channel_internal(uuid)
  to service_role;

revoke execute on function public.get_teacher_whatsapp_token_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.get_teacher_whatsapp_token_internal(uuid)
  to service_role;

revoke execute on function public.set_teacher_whatsapp_token(uuid, text)
  from public, anon;
grant execute on function public.set_teacher_whatsapp_token(uuid, text)
  to authenticated;
