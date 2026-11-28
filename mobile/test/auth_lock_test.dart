import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/auth/data/app_lock_service.dart';
import 'package:mister/features/auth/data/auth_gateway.dart';
import 'package:mister/features/auth/data/auth_repository_impl.dart';

class MemoryStore implements SecureKeyValueStore {
  final Map<String, String> values = {};

  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> delete(String key) async => values.remove(key);
}

class FakeBiometrics implements BiometricGateway {
  bool available = true;
  bool result = true;

  @override
  Future<bool> isAvailable() async => available;
  @override
  Future<bool> authenticate(String localizedReason) async => result;
}

class FakeAuthGateway implements AuthGateway {
  Object? errorToThrow;
  bool signedIn = false;
  int resetCalls = 0;

  @override
  Future<void> signInWithPassword({required String email, required String password}) async {
    final e = errorToThrow;
    if (e != null) throw e;
    signedIn = true;
  }

  @override
  Future<void> signOut() async => signedIn = false;

  @override
  Future<void> resetPasswordForEmail(String email) async => resetCalls++;

  @override
  Stream<bool> get authStateChanges => Stream.value(signedIn);

  @override
  String? get currentUserId => signedIn ? 'user-1' : null;
}

/// خدمة Supabase وهمية مختصرة — F1-T5 يحتاج rpc فقط هنا.
/// (بقية الواجهة عبر noSuchMethod — لا تُستدعى في هذه الاختبارات.)
class RpcOnlyService implements SupabaseService {
  final List<String> rpcNames = [];

  @override
  String? get currentUserId => 'user-1';

  @override
  Future<Map<String, dynamic>?> rpc(String name, Map<String, dynamic> params) async {
    rpcNames.add(name);
    return null;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('${invocation.memberName} not stubbed');
}

void main() {
  group('AuthRepository', () {
    test('successful sign-in claims pending invites exactly once', () async {
      final gateway = FakeAuthGateway();
      final service = RpcOnlyService();
      final repo = AuthRepositoryImpl(gateway, service);
      await repo.signInWithEmail(email: 'a@b.c', password: 'secret');
      expect(service.rpcNames, ['claim_teacher_invites']);
    });

    test('failed sign-in propagates AppError and never claims invites', () async {
      final gateway = FakeAuthGateway()
        ..errorToThrow = const AppError(kind: AppErrorKind.auth, arbKey: 'auth_invalid_credentials');
      final service = RpcOnlyService();
      final repo = AuthRepositoryImpl(gateway, service);
      await expectLater(
        repo.signInWithEmail(email: 'a@b.c', password: 'wrong'),
        throwsA(isA<AppError>().having((e) => e.arbKey, 'arbKey', 'auth_invalid_credentials')),
      );
      expect(service.rpcNames, isEmpty);
    });

    test('password reset delegates to the gateway', () async {
      final gateway = FakeAuthGateway();
      final repo = AuthRepositoryImpl(gateway, RpcOnlyService());
      await repo.requestPasswordResetEmail('a@b.c');
      expect(gateway.resetCalls, 1);
    });
  });

  group('AppLockService', () {
    test('PIN is stored hashed (never raw) and verifies correctly', () async {
      final store = MemoryStore();
      final lock = AppLockService(store, FakeBiometrics());
      await lock.setPin('2468');
      final storedHash = store.values['mister.lock.pin_hash'];
      expect(storedHash, isNotNull);
      expect(storedHash, isNot(contains('2468')));
      expect(await lock.isPinSet(), isTrue);
      expect(await lock.isLockEnabled(), isTrue);

      lock.lock();
      expect(lock.isUnlocked, isFalse);
      expect(await lock.verifyPin('0000'), isFalse);
      expect(lock.isUnlocked, isFalse);
      expect(await lock.verifyPin('2468'), isTrue);
      expect(lock.isUnlocked, isTrue);
    });

    test('biometric unlock flips state only on success', () async {
      final bio = FakeBiometrics()..result = false;
      final lock = AppLockService(MemoryStore(), bio);
      expect(await lock.unlockWithBiometrics('افتح مستر'), isFalse);
      expect(lock.isUnlocked, isFalse);
      bio.result = true;
      expect(await lock.unlockWithBiometrics('افتح مستر'), isTrue);
      expect(lock.isUnlocked, isTrue);
    });

    test('no lock enabled → never locks on resume; disable clears the PIN', () async {
      final store = MemoryStore();
      final lock = AppLockService(store, FakeBiometrics());
      lock.onPaused();
      expect(await lock.shouldLockOnResume(), isFalse);

      await lock.setPin('1357');
      await lock.disableLock();
      expect(await lock.isPinSet(), isFalse);
      expect(await lock.isLockEnabled(), isFalse);
    });
  });
}
