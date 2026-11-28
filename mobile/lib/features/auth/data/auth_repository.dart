/// عقود F1-T1 v1.1 (§3) — واجهة AuthRepository.
/// التنفيذ في F1-T5 (GoTrue عبر SupabaseService). واتساب OTP نايم في v1.
abstract class AuthRepository {
  Future<void> signInWithEmail(
      {required String email, required String password,});
  Future<void> signOut();
  Future<void> requestPasswordResetEmail(String email);
  Stream<bool> get authStateChanges;
  Future<void> claimPendingInvites();
  // واتساب OTP — يُفعَّل في فيز 2 / عند البرودكشن؛ السطح يعرض «قريبًا» فقط في V1:
  // Future<void> signInWithPhoneOtp(String phoneE164);
  // Future<void> verifyPhoneOtp({required String phoneE164, required String code});
}
