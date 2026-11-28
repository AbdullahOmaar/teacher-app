import 'package:mister/core/data/services.dart';
import 'package:mister/features/auth/data/auth_gateway.dart';
import 'package:mister/features/auth/data/auth_repository.dart';

/// تنفيذ AuthRepository — عقود §3.
/// بعد كل دخول ناجح: ادّعاء الدعوات المعلّقة (claim_teacher_invites 0006)
/// ثم اختيار مساحة العمل عند طبقة العرض عبر TeacherRepository.
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._gateway, this._service);

  final AuthGateway _gateway;
  final SupabaseService _service;

  @override
  Future<void> signInWithEmail({required String email, required String password}) async {
    await _gateway.signInWithPassword(email: email, password: password);
    await claimPendingInvites();
  }

  @override
  Future<void> signOut() => _gateway.signOut();

  @override
  Future<void> requestPasswordResetEmail(String email) => _gateway.resetPasswordForEmail(email);

  @override
  Stream<bool> get authStateChanges => _gateway.authStateChanges;

  @override
  Future<void> claimPendingInvites() async {
    await _service.rpc('claim_teacher_invites', const {});
  }
}
