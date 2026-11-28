import 'package:mister/core/error/app_error.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// ترجمة أخطاء Supabase المركزية — عقود F1-T1 v1.1 (§5).
/// كل خطأ خادم/شبكة يتحول هنا إلى AppError بمفتاح ARB؛ النص الخام
/// لا يغادر هذه الطبقة أبدًا (يُسجَّل للتشخيص فقط عبر errorReporter لاحقًا).
AppError mapSupabaseError(Object error) {
  if (error is AppError) return error;

  if (error is PostgrestException) {
    return AppError.fromPostgresCode(error.code ?? '');
  }

  if (error is AuthException) {
    final msg = error.message.toLowerCase();
    if (msg.contains('invalid login credentials')) {
      return const AppError(
          kind: AppErrorKind.auth, arbKey: 'auth_invalid_credentials',);
    }
    if (msg.contains('email not confirmed')) {
      return const AppError(
          kind: AppErrorKind.auth, arbKey: 'auth_email_not_confirmed',);
    }
    if (msg.contains('rate limit') || msg.contains('too many')) {
      return const AppError(
          kind: AppErrorKind.auth, arbKey: 'auth_too_many_attempts',);
    }
    if (msg.contains('session') &&
        (msg.contains('expired') || msg.contains('invalid'))) {
      return const AppError(
          kind: AppErrorKind.auth, arbKey: 'common_session_expired',);
    }
    return const AppError(
        kind: AppErrorKind.auth, arbKey: 'common_unexpected_error',);
  }

  if (error is StorageException) {
    return AppError.unknown();
  }

  // أخطاء شبكة/نقل (SocketException وغيرها من طبقة http) — بلا نص خام.
  final name = error.runtimeType.toString();
  if (name.contains('Socket') ||
      name.contains('ClientException') ||
      name.contains('Network')) {
    return AppError.network();
  }
  if (name.contains('Timeout')) {
    return AppError.timeout();
  }

  return AppError.unknown();
}
