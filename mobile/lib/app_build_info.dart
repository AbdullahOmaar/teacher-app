/// بيانات البناء — سطر الإصدار الظاهر (قاعدة مالك 2026-11-25).
/// يُبنى من بيانات البناء نفسه لا يدويًا: --dart-define=APP_VERSION / APP_BUILT_AT
/// في CI (workflow check.yml يمرّرهما من git describe + وقت البناء).
/// السبلاش + شاشة الإعدادات يعرضان: «الإصدار X — نُشر [date/time]».
class AppBuildInfo {
  const AppBuildInfo._();

  static const String version = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '0.1.0-dev',
  );

  static const String builtAt = String.fromEnvironment(
    'APP_BUILT_AT',
    defaultValue: 'dev',
  );

  /// سطر الإصدار كما يظهر للمستخدم.
  static String get releaseLine => 'الإصدار $version — نُشر $builtAt';
}
