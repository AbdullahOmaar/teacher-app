import 'package:mister/core/data/local_storage_service.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/features/attendance/domain/models/attendance.dart';

/// محرك مزامنة الحضور — حالة Domain المعتمدة #1 (الملحق أ).
/// منطق نقي فوق مخزن الطابور وبوابة رفع — دلالات الويب (offlineQueue.ts):
/// - التصريف بالترتيب الزمني، وكل عنصر upsert idempotent.
/// - فشل شبكي ⇒ إيقاف فوري للتصريف، ولا تُحتسب محاولة لأي عنصر.
/// - فشل غير شبكي ⇒ attempts+1 وlastError = مفتاح ARB (لا نص خام)،
///   وعند MAX_ATTEMPTS ‏(3) يُعلَّم failed ويخرج من المزامنة التلقائية.
/// - العناصر الفاشلة مسبقًا تُحسب في النتيجة ولا تُعاد محاولتها.
class AttendanceSyncEngine {
  AttendanceSyncEngine(this._store, this._upload);

  final AttendanceQueueStore _store;

  /// بوابة الرفع — في الإنتاج: upsert عبر SupabaseService من الريبو.
  final Future<void> Function(QueuedAttendanceItem item) _upload;

  static const int maxAttempts = 3;

  Future<SyncResult> drain() async {
    final items = await _store.readQueue();
    var synced = 0;
    var failed = 0;
    for (final item in items) {
      if (item.failed) {
        failed++;
        continue;
      }
      try {
        await _upload(item);
        await _store.removeFromQueue(item.key);
        synced++;
      } on AppError catch (e) {
        if (e.kind == AppErrorKind.network || e.kind == AppErrorKind.timeout) {
          break;
        }
        final attempts = item.attempts + 1;
        final nowFailed = attempts >= maxAttempts;
        await _store.saveQueueItem(
          item.copyWith(attempts: attempts, lastError: e.arbKey, failed: nowFailed),
        );
        if (nowFailed) failed++;
      }
    }
    return SyncResult(synced: synced, failed: failed);
  }
}
