import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// كاش قراءة محلي (Drift) — عقود §3: كاش حصص اليوم/الغد + القوائم.
/// تصميم عام بلا فقد: كل صف مخزّن = JSON الصف الخادمي كاملًا (payload)
/// فتُعاد بناء الموديلات من نفس fromJson — لا نسخة ثانية من الحقول.
class CachedEntities extends Table {
  /// 'session' | 'student' | 'group'
  TextColumn get entity => text()();
  TextColumn get id => text()();
  TextColumn get teacherId => text()();
  TextColumn get payload => text()();
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {entity, id};
}

@DriftDatabase(tables: [CachedEntities])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// قاعدة الجهاز الفعلية (ملف في مجلد مستندات التطبيق).
  static Future<AppDatabase> openOnDevice() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'mister_cache.sqlite'));
    return AppDatabase(NativeDatabase.createInBackground(file));
  }

  @override
  int get schemaVersion => 1;
}
