import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:local_auth/local_auth.dart';
import 'package:mister/core/error/app_error.dart';

/// مخزن آمن بمفتاح/قيمة — تنفيذ الإنتاج SecureStorageServiceImpl،
/// والاختبارات تستخدم نسخة ذاكرة.
abstract class SecureKeyValueStore {
  Future<void> write(String key, String value);
  Future<String?> read(String key);
  Future<void> delete(String key);
}

/// بوابة البيومتري — تُعزل local_auth لتُختبَر بوهمي.
abstract class BiometricGateway {
  Future<bool> isAvailable();
  Future<bool> authenticate(String localizedReason);
}

class LocalAuthGateway implements BiometricGateway {
  LocalAuthGateway([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> isAvailable() async {
    try {
      return await _auth.isDeviceSupported() && await _auth.canCheckBiometrics;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> authenticate(String localizedReason) async {
    try {
      return await _auth.authenticate(
        localizedReason: localizedReason,
        options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
      );
    } catch (_) {
      return false;
    }
  }
}

/// قفل التطبيق (MASVS AUTH) — عقود F1-T5:
/// - PIN يُخزَّن كهاش SHA-256 بملح عشوائي في المخزن الآمن — لا PIN خام أبدًا.
/// - البيومتري يفتح القفل كحالة (لا يُخزَّن أي سر بيومتري).
/// - قفل تلقائي عند العودة من الخلفية بعد مهلة (افتراضي 60 ثانية).
class AppLockService {
  AppLockService(this._storage, this._biometrics);

  final SecureKeyValueStore _storage;
  final BiometricGateway _biometrics;

  static const String _pinHashKey = 'mister.lock.pin_hash';
  static const String _pinSaltKey = 'mister.lock.pin_salt';
  static const String _enabledKey = 'mister.lock.enabled';

  static const Duration autoLockAfter = Duration(seconds: 60);

  bool _unlocked = false;
  DateTime? _backgroundedAt;

  bool get isUnlocked => _unlocked;

  Future<bool> isLockEnabled() async => (await _storage.read(_enabledKey)) == '1';

  Future<bool> isPinSet() async => (await _storage.read(_pinHashKey)) != null;

  Future<void> setPin(String pin) async {
    final salt = _generateSalt();
    await _storage.write(_pinSaltKey, salt);
    await _storage.write(_pinHashKey, _hash(pin, salt));
    await _storage.write(_enabledKey, '1');
    _unlocked = true;
  }

  Future<bool> verifyPin(String pin) async {
    final salt = await _storage.read(_pinSaltKey);
    final expected = await _storage.read(_pinHashKey);
    if (salt == null || expected == null) return false;
    final ok = _hash(pin, salt) == expected;
    if (ok) _unlocked = true;
    return ok;
  }

  Future<bool> biometricAvailable() => _biometrics.isAvailable();

  Future<bool> unlockWithBiometrics(String localizedReason) async {
    final ok = await _biometrics.authenticate(localizedReason);
    if (ok) _unlocked = true;
    return ok;
  }

  /// عند إيقاف التطبيق مؤقتًا (خلفية) — تُستدعى من مراقب دورة الحياة في القشرة.
  void onPaused() {
    _backgroundedAt = DateTime.now();
  }

  /// عند العودة للمقدمة: يقفل لو القفل مفعّل وعدّت المهلة.
  Future<bool> shouldLockOnResume() async {
    if (!await isLockEnabled()) return false;
    final at = _backgroundedAt;
    if (at == null) return false;
    if (DateTime.now().difference(at) >= autoLockAfter) {
      _unlocked = false;
      return true;
    }
    return false;
  }

  void lock() {
    _unlocked = false;
  }

  Future<void> disableLock() async {
    await _storage.delete(_pinHashKey);
    await _storage.delete(_pinSaltKey);
    await _storage.delete(_enabledKey);
    _unlocked = true;
  }

  String _hash(String pin, String salt) => sha256.convert(utf8.encode('$salt:$pin')).toString();

  String _generateSalt() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Url.encode(bytes);
  }

  /// خطأ قفل موحّد عند الحاجة في طبقة العرض.
  static AppError lockedError() =>
      const AppError(kind: AppErrorKind.auth, arbKey: 'common_session_expired');
}
