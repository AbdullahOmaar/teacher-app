import 'dart:io' show Platform;

import 'package:mister/core/config/feature_flags.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/features/push/data/push_messaging_gateway.dart';

/// تسجيل توكن جهاز المستخدم في device_push_tokens (مهاجرة 0077).
/// محكوم بعلم FeatureFlags.pushNotifications: مطفأ = لا أي استدعاء
/// (الحالة النائمة المصممة) حتى خطوة تفعيل FCM عند المالك.
class PushTokenRepository {
  PushTokenRepository(
    this._service,
    this._gateway, {
    bool? enabled,
  }) : _enabled = enabled ?? FeatureFlags.pushNotifications;

  final SupabaseService _service;
  final PushMessagingGateway _gateway;
  final bool _enabled;

  static const String table = 'device_push_tokens';

  String? get _platform {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return null;
  }

  /// تسجيل/تحديث توكن الجهاز الحالي — false عندما نائم أو لا توكن.
  /// upsert على token (فريد) فالتكرار idempotent.
  Future<bool> registerCurrentDevice() async {
    if (!_enabled) return false;
    final platform = _platform;
    if (platform == null) return false;
    final userId = _service.currentUserId;
    if (userId == null) return false;
    final token = await _gateway.currentToken();
    if (token == null || token.isEmpty) return false;
    await _service.upsertRow(
      table,
      {
        'user_id': userId,
        'token': token,
        'platform': platform,
        'last_seen_at': DateTime.now().toUtc().toIso8601String(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'token',
    );
    return true;
  }

  /// إزالة توكن الجهاز الحالي (عند تسجيل الخروج).
  Future<void> unregisterCurrentDevice() async {
    if (!_enabled) return;
    final token = await _gateway.currentToken();
    if (token == null) return;
    await _service.deleteRow(table, filters: {'token': token});
  }
}
