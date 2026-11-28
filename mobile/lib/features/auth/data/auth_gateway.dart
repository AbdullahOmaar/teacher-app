import 'package:mister/core/error/supabase_error_mapper.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// بوابة GoTrue الضيقة — تُعزل المصادقة عن بقية طبقة البيانات لتُختبَر
/// بوهمي، وكل أخطائها تخرج AppError بمفتاح ARB (عقود §5).
abstract class AuthGateway {
  Future<void> signInWithPassword({required String email, required String password});
  Future<void> signOut();
  Future<void> resetPasswordForEmail(String email);

  /// true عند وجود جلسة، false عند غيابها/انتهائها.
  Stream<bool> get authStateChanges;
  String? get currentUserId;
}

/// تنفيذ Supabase — نظير features/auth/api.ts في الويب (GoTrue، PKCE).
class SupabaseAuthGateway implements AuthGateway {
  SupabaseAuthGateway(this._auth);

  final GoTrueClient _auth;

  @override
  Future<void> signInWithPassword({required String email, required String password}) async {
    try {
      await _auth.signInWithPassword(email: email, password: password);
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await _auth.signOut();
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Future<void> resetPasswordForEmail(String email) async {
    try {
      await _auth.resetPasswordForEmail(email);
    } catch (e) {
      throw mapSupabaseError(e);
    }
  }

  @override
  Stream<bool> get authStateChanges =>
      _auth.onAuthStateChange.map((data) => data.session != null);

  @override
  String? get currentUserId => _auth.currentUser?.id;
}
