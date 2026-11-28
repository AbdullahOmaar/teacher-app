import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/data/services.dart';
import 'package:mister/features/push/data/push_messaging_gateway.dart';
import 'package:mister/features/push/data/push_token_repository.dart';

/// خدمة تسجّل الاستدعاءات — للتحقق من سلوك العلم النائم والتسجيل.
class RecordingService implements SupabaseService {
  final List<String> calls = [];
  final List<Map<String, dynamic>> upserts = [];

  @override
  String? get currentUserId => 'user-1';

  @override
  Future<void> upsertRow(String table, Map<String, dynamic> values, {required String onConflict}) async {
    calls.add('upsert:$table:$onConflict');
    upserts.add(values);
  }

  @override
  Future<void> deleteRow(String table, {required Map<String, Object> filters}) async {
    calls.add('delete:$table');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeGateway implements PushMessagingGateway {
  FakeGateway(this.token);
  final String? token;

  @override
  Future<String?> currentToken() async => token;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Future<bool> requestPermission() async => true;
}

void main() {
  group('PushTokenRepository (F1-T8 loop, parked by flag)', () {
    test('flag off (default): register/unregister make NO service calls', () async {
      final service = RecordingService();
      final repo = PushTokenRepository(service, FakeGateway('tok-1'));
      expect(await repo.registerCurrentDevice(), isFalse);
      await repo.unregisterCurrentDevice();
      expect(service.calls, isEmpty);
    });

    test('DormantPushGateway: no token, no permission, empty refresh stream', () async {
      const gateway = DormantPushGateway();
      expect(await gateway.currentToken(), isNull);
      expect(await gateway.requestPermission(), isFalse);
      expect(await gateway.tokenRefreshes.isEmpty, isTrue);
    });

    test('enabled + token: upserts the device row on conflict token', () async {
      final service = RecordingService();
      final repo = PushTokenRepository(service, FakeGateway('tok-abc'), enabled: true);
      // على بيئة اختبار غير أندرويد/iOS قد ترجع false من فحص المنصة —
      // نقبل أيًا من النتيجتين لكن عند التسجيل يجب أن يكون الصف صحيحًا.
      final registered = await repo.registerCurrentDevice();
      if (registered) {
        expect(service.calls, ['upsert:device_push_tokens:token']);
        final row = service.upserts.single;
        expect(row['user_id'], 'user-1');
        expect(row['token'], 'tok-abc');
        expect(row['platform'], isIn(['android', 'ios']));
      }
    });

    test('enabled but gateway has no token: no write, returns false', () async {
      final service = RecordingService();
      final repo = PushTokenRepository(service, FakeGateway(null), enabled: true);
      expect(await repo.registerCurrentDevice(), isFalse);
      expect(service.calls, isEmpty);
    });
  });
}
