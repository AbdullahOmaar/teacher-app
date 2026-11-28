import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/features/auth/data/app_lock_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// تنفيذ SecureStorageService — flutter_secure_storage (MASVS STORAGE:
/// الجلسة والبيانات الحساسة في مخزن نظام التشغيل الآمن فقط).
class SecureStorageServiceImpl implements SecureStorageService, SecureKeyValueStore {
  SecureStorageServiceImpl([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const String _sessionKey = 'mister.session';

  @override
  Future<void> saveSession(String json) => _storage.write(key: _sessionKey, value: json);

  @override
  Future<String?> readSession() => _storage.read(key: _sessionKey);

  @override
  Future<void> clearAll() => _storage.deleteAll();

  /// وصول عام بمفتاح — لقفل التطبيق (PIN) وإعدادات الأمان.
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// تخزين جلسة GoTrue داخل flutter_secure_storage بدل التخزين الافتراضي —
/// شرط MASVS: رموز الجلسة لا تعيش في SharedPreferences/UserDefaults عادية.
class SecureGoTrueStorage extends LocalStorage {
  SecureGoTrueStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const String _key = 'supabase.auth.token';

  @override
  Future<void> initialize() async {}

  @override
  Future<String?> accessToken() => _storage.read(key: _key);

  @override
  Future<bool> hasAccessToken() async => (await accessToken()) != null;

  @override
  Future<void> persistSession(String persistSessionString) =>
      _storage.write(key: _key, value: persistSessionString);

  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);
}
