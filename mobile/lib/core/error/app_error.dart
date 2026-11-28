/// مخطط الأخطاء المترجمة — عقود F1-T1 v1.1 (§5).
/// القاعدة الحديدية: لا رسالة خام من الخادم تصل للواجهة أبدًا.
/// كل خطأ يُعرَض بترجمة مفتاح ARB فقط؛ النص الخام يذهب لـ errorReporter للتشخيص.
enum AppErrorKind {
  network,
  timeout,
  auth,
  permission,
  conflict,
  validation,
  sync,
  unknown,
}

/// أين يُعرض الخطأ: أوامر ← SnackBar، أخطاء تحميل ← حالة inline داخل الشاشة.
enum DisplayStyle { snackBar, inline }

class AppError implements Exception {
  const AppError({
    required this.kind,
    required this.arbKey,
    this.display = DisplayStyle.snackBar,
  });

  factory AppError.network() => const AppError(
        kind: AppErrorKind.network,
        arbKey: 'common_network_error',
      );

  factory AppError.timeout() => const AppError(
        kind: AppErrorKind.timeout,
        arbKey: 'common_timeout',
      );

  factory AppError.unknown() => const AppError(
        kind: AppErrorKind.unknown,
        arbKey: 'common_unexpected_error',
      );

  /// التعيين من كود Postgres — عقود §5-2.
  factory AppError.fromPostgresCode(String code) {
    return switch (code) {
      '23503' => const AppError(
          kind: AppErrorKind.conflict,
          arbKey: 'common_delete_blocked_by_links',
        ),
      '23505' => const AppError(
          kind: AppErrorKind.conflict,
          arbKey: 'common_duplicate_entry',
        ),
      '42501' => const AppError(
          kind: AppErrorKind.permission,
          arbKey: 'common_no_permission',
        ),
      _ => AppError.unknown(),
    };
  }

  final AppErrorKind kind;

  /// مفتاح ARB (snake_case كما في ملفَّي الخط ب) — الواجهة تعرض ترجمته فقط.
  final String arbKey;
  final DisplayStyle display;

  @override
  String toString() => 'AppError($kind, $arbKey)';
}

/// حالة كل شاشة — واحدة لكل الشاشات (عقود §6).
sealed class UiState<T> {
  const UiState();
  const factory UiState.initial() = UiInitial<T>;
  const factory UiState.loading() = UiLoading<T>;
  const factory UiState.data(T value) = UiData<T>;
  const factory UiState.error(AppError error) = UiError<T>;
}

class UiInitial<T> extends UiState<T> {
  const UiInitial();
}

class UiLoading<T> extends UiState<T> {
  const UiLoading();
}

class UiData<T> extends UiState<T> {
  const UiData(this.value);
  final T value;
}

class UiError<T> extends UiState<T> {
  const UiError(this.error);
  final AppError error;
}
