import 'package:mister/core/data/services.dart';
import 'package:mister/core/error/supabase_error_mapper.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// إعدادات البيئة — من --dart-define فقط (لا أسرار في الكود).
/// فيز 1 = مشروع الديمو؛ الانتقال للبرودكشن = تغيير القيم فقط.
class AppConfig {
  const AppConfig._();

  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey =
      String.fromEnvironment('SUPABASE_ANON_KEY');
}

/// العميل الوحيد — نظير lib/supabase.ts في الويب.
/// أي نداء Supabase في التطبيق يمر من هنا حصرًا (بوابة خروج F1-T4).
class SupabaseServiceImpl implements SupabaseService {
  SupabaseServiceImpl(this.client);

  /// يُبنى مرة واحدة عند الإقلاع (F1-T5 يربطه بدورة الجلسة).
  final SupabaseClient client;

  @override
  String? get currentUserId => client.auth.currentUser?.id;

  @override
  Future<List<Map<String, dynamic>>> select(
    String table, {
    required String columns,
    required Map<String, Object> filters,
  }) async {
    try {
      var query = client.from(table).select(columns);
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      final result = await query.order('created_at');
      return (result as List).cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  /// استعلام بلا ترتيب افتراضي (للـviews والقوائم الخاصة).
  @override
  Future<List<Map<String, dynamic>>> selectUnordered(
    String table, {
    required String columns,
    required Map<String, Object> filters,
  }) async {
    try {
      var query = client.from(table).select(columns);
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      final result = await query;
      return (result as List).cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<List<Map<String, dynamic>>> selectRange(
    String table, {
    required String columns,
    required Map<String, Object> filters,
    required String rangeColumn,
    required Object from,
    required Object to,
  }) async {
    try {
      var query = client.from(table).select(columns);
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      final result = await query
          .gte(rangeColumn, from)
          .lte(rangeColumn, to)
          .order('session_date');
      return (result as List).cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<List<Map<String, dynamic>>> selectIn(
    String table, {
    required String columns,
    required Map<String, Object> filters,
    required String inColumn,
    required List<Object> inValues,
  }) async {
    try {
      var query = client.from(table).select(columns);
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      final result = await query.inFilter(inColumn, inValues);
      return (result as List).cast<Map<String, dynamic>>();
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  /// إدخال/تحديث يعيد الصف — تُستخدم من الريبو فقط.
  @override
  Future<Map<String, dynamic>> insertRow(
      String table, Map<String, dynamic> values,) async {
    try {
      final result = await client.from(table).insert(values).select().single();
      return result;
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<Map<String, dynamic>> updateRow(
    String table,
    Map<String, dynamic> values, {
    required Map<String, Object> filters,
  }) async {
    try {
      var query = client.from(table).update(values);
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      final result = await query.select().single();
      return result;
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<void> deleteRow(String table,
      {required Map<String, Object> filters,}) async {
    try {
      var query = client.from(table).delete();
      for (final entry in filters.entries) {
        query = query.eq(entry.key, entry.value);
      }
      await query;
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<Map<String, dynamic>?> rpc(
      String name, Map<String, dynamic> params,) async {
    try {
      final result = await client.rpc<dynamic>(name, params: params);
      if (result is Map<String, dynamic>) return result;
      return null;
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  /// RPC يعيد قائمة صفوف (مثل claim_teacher_invites عند الحاجة).
  @override
  Future<List<Map<String, dynamic>>> rpcList(
      String name, Map<String, dynamic> params,) async {
    try {
      final result = await client.rpc<dynamic>(name, params: params);
      if (result is List) return result.cast<Map<String, dynamic>>();
      return const [];
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }
}
