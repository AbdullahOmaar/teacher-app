import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:mister/core/data/app_database.dart';

/// كاش قراءة فوق AppDatabase — يُستخدم من الريبو فقط (قراءة عند غياب
/// الشبكة/تسريع فتح الشاشات)، والخادم يبقى مصدر الحقيقة (SSOT).
class LocalCache {
  LocalCache(this._db);

  final AppDatabase _db;

  Future<void> putAll(
      String entity, String teacherId, List<Map<String, dynamic>> rows,) async {
    final now = DateTime.now();
    await _db.batch((batch) {
      batch.insertAllOnConflictUpdate(
        _db.cachedEntities,
        rows.map(
          (r) => CachedEntitiesCompanion.insert(
            entity: entity,
            id: r['id'] as String,
            teacherId: teacherId,
            payload: jsonEncode(r),
            cachedAt: now,
          ),
        ),
      );
    });
  }

  Future<List<Map<String, dynamic>>> getAll(
      String entity, String teacherId,) async {
    final query = _db.select(_db.cachedEntities)
      ..where((t) => t.entity.equals(entity) & t.teacherId.equals(teacherId));
    final rows = await query.get();
    return rows
        .map((r) => (jsonDecode(r.payload) as Map).cast<String, dynamic>())
        .toList();
  }

  /// استبدال كامل لكيان مدرّس (بعد جلب ناجح من الخادم).
  Future<void> replaceAll(
      String entity, String teacherId, List<Map<String, dynamic>> rows,) async {
    await _db.transaction(() async {
      await (_db.delete(_db.cachedEntities)
            ..where(
                (t) => t.entity.equals(entity) & t.teacherId.equals(teacherId),))
          .go();
      await putAll(entity, teacherId, rows);
    });
  }

  Future<void> clearTeacher(String teacherId) {
    return (_db.delete(_db.cachedEntities)
          ..where((t) => t.teacherId.equals(teacherId)))
        .go();
  }
}
