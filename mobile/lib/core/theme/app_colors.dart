import 'package:flutter/material.dart';

/// توكنز الألوان الحاكمة — منقولة حرفيًا من `src/index.css` في الويب
/// (جرد نظام التصميم §1: 21 توكن × فاتح/داكن + الظلّان).
/// قاعدة الانضباط W6/R-3: لا هكس يدوي في مكونات الواجهة خارج هذا الملف.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.bg,
    required this.card,
    required this.elevated,
    required this.border,
    required this.borderInteractive,
    required this.text,
    required this.muted,
    required this.primary,
    required this.primaryDark,
    required this.onPrimary,
    required this.soft,
    required this.accent,
    required this.ok,
    required this.okText,
    required this.okSoft,
    required this.warn,
    required this.warnText,
    required this.warnSoft,
    required this.bad,
    required this.badText,
    required this.badSoft,
    required this.shadowCard,
    required this.shadowRaised,
  });

  /// خلفية التطبيق (`--bg`).
  final Color bg;

  /// سطح البطاقة (`--card`).
  final Color card;

  /// سطح مرتفع — Sheets/منبثقات (`--elevated`).
  final Color elevated;

  /// حدود زخرفية فقط (`--border`).
  final Color border;

  /// حدود تفاعلية — حقول/أزرار (`--border-interactive`).
  final Color borderInteractive;

  /// النص الأساسي (`--text`).
  final Color text;

  /// النص الثانوي (`--muted`).
  final Color muted;

  /// الأساسي «نيلي الثقة» (`--primary`).
  final Color primary;

  /// الأساسي الداكن — hover/ضغط (`--primary-d`).
  final Color primaryDark;

  /// نص الزر الأساسي (`--on-primary`).
  final Color onPrimary;

  /// حاويات/خلفيات خفيفة (`--soft`).
  final Color soft;

  /// كهرماني — «للحظات الإنجاز فقط» (`--accent`).
  final Color accent;

  /// نجاح — حشوة (`--ok`).
  final Color ok;

  /// نجاح — نصي بتباين ≥4.5:1 (`--ok-text`).
  final Color okText;

  /// نجاح — خلفية خفيفة (`--ok-soft`).
  final Color okSoft;

  /// تحذير — حشوة (`--warn`).
  final Color warn;

  /// تحذير — نصي (`--warn-text`).
  final Color warnText;

  /// تحذير — خلفية خفيفة (`--warn-soft`).
  final Color warnSoft;

  /// خطر — حشوة (`--bad`).
  final Color bad;

  /// خطر — نصي (`--bad-text`).
  final Color badText;

  /// خطر — خلفية خفيفة (`--bad-soft`).
  final Color badSoft;

  /// لون ظل البطاقة (`--shadow-card`: ‏0 1px 2px).
  final Color shadowCard;

  /// لون ظل المرتفع (`--shadow-raised`: ‏0 8px 24px).
  final Color shadowRaised;

  /// ظل البطاقة الوحيد في النظام.
  List<BoxShadow> get cardShadow => [
        BoxShadow(color: shadowCard, blurRadius: 2, offset: const Offset(0, 1)),
      ];

  /// ظل الأسطح المرتفعة الوحيد في النظام.
  List<BoxShadow> get raisedShadow => [
        BoxShadow(
            color: shadowRaised, blurRadius: 24, offset: const Offset(0, 8),),
      ];

  static const AppColors light = AppColors(
    bg: Color(0xFFF7F8FC),
    card: Color(0xFFFFFFFF),
    elevated: Color(0xFFFFFFFF),
    border: Color(0xFFE3E6F0),
    borderInteractive: Color(0xFF7E8AB0),
    text: Color(0xFF141A2E),
    muted: Color(0xFF5B6478),
    primary: Color(0xFF4F46E5),
    primaryDark: Color(0xFF4338CA),
    onPrimary: Color(0xFFFFFFFF),
    soft: Color(0xFFEEF2FF),
    accent: Color(0xFFF59E0B),
    ok: Color(0xFF0E9F6E),
    okText: Color(0xFF047857),
    okSoft: Color(0xFFECFDF5),
    warn: Color(0xFFF59E0B),
    warnText: Color(0xFFB45309),
    warnSoft: Color(0xFFFEF3C7),
    bad: Color(0xFFDC2626),
    badText: Color(0xFFB91C1C),
    badSoft: Color(0xFFFEF2F2),
    shadowCard: Color(0x0D0F172A),
    shadowRaised: Color(0x290F172A),
  );

  static const AppColors dark = AppColors(
    bg: Color(0xFF0E1120),
    card: Color(0xFF171B2E),
    elevated: Color(0xFF1E2438),
    border: Color(0xFF262C47),
    borderInteractive: Color(0xFF5D6CA3),
    text: Color(0xFFF2F4FA),
    muted: Color(0xFFA3AAC2),
    primary: Color(0xFF8B85F7),
    primaryDark: Color(0xFFA09BF8),
    onPrimary: Color(0xFF141A2E),
    soft: Color(0xFF232046),
    accent: Color(0xFFFBBF24),
    ok: Color(0xFF34D399),
    okText: Color(0xFF34D399),
    okSoft: Color(0xFF0F2E23),
    warn: Color(0xFFFBBF24),
    warnText: Color(0xFFFBBF24),
    warnSoft: Color(0xFF33270E),
    bad: Color(0xFFF87171),
    badText: Color(0xFFF87171),
    badSoft: Color(0xFF33161A),
    shadowCard: Color(0x59000000),
    shadowRaised: Color(0x80000000),
  );

  /// لوحة لهجة الهوية البيضاء — بيانات يختارها المدرّس (`src/lib/brand.ts`)،
  /// ليست توكنز قشرة. تسمياتها مفاتيح `commonAccent*` في القاموس.
  static const List<Color> brandPalette = [
    Color(0xFF4F46E5),
    Color(0xFF7C3AED),
    Color(0xFF1D4ED8),
    Color(0xFF0F766E),
    Color(0xFF15803D),
    Color(0xFFB45309),
    Color(0xFFBE185D),
    Color(0xFFDC2626),
  ];

  @override
  AppColors copyWith({
    Color? bg,
    Color? card,
    Color? elevated,
    Color? border,
    Color? borderInteractive,
    Color? text,
    Color? muted,
    Color? primary,
    Color? primaryDark,
    Color? onPrimary,
    Color? soft,
    Color? accent,
    Color? ok,
    Color? okText,
    Color? okSoft,
    Color? warn,
    Color? warnText,
    Color? warnSoft,
    Color? bad,
    Color? badText,
    Color? badSoft,
    Color? shadowCard,
    Color? shadowRaised,
  }) {
    return AppColors(
      bg: bg ?? this.bg,
      card: card ?? this.card,
      elevated: elevated ?? this.elevated,
      border: border ?? this.border,
      borderInteractive: borderInteractive ?? this.borderInteractive,
      text: text ?? this.text,
      muted: muted ?? this.muted,
      primary: primary ?? this.primary,
      primaryDark: primaryDark ?? this.primaryDark,
      onPrimary: onPrimary ?? this.onPrimary,
      soft: soft ?? this.soft,
      accent: accent ?? this.accent,
      ok: ok ?? this.ok,
      okText: okText ?? this.okText,
      okSoft: okSoft ?? this.okSoft,
      warn: warn ?? this.warn,
      warnText: warnText ?? this.warnText,
      warnSoft: warnSoft ?? this.warnSoft,
      bad: bad ?? this.bad,
      badText: badText ?? this.badText,
      badSoft: badSoft ?? this.badSoft,
      shadowCard: shadowCard ?? this.shadowCard,
      shadowRaised: shadowRaised ?? this.shadowRaised,
    );
  }

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    return AppColors(
      bg: Color.lerp(bg, other.bg, t)!,
      card: Color.lerp(card, other.card, t)!,
      elevated: Color.lerp(elevated, other.elevated, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderInteractive:
          Color.lerp(borderInteractive, other.borderInteractive, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      primaryDark: Color.lerp(primaryDark, other.primaryDark, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      soft: Color.lerp(soft, other.soft, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      ok: Color.lerp(ok, other.ok, t)!,
      okText: Color.lerp(okText, other.okText, t)!,
      okSoft: Color.lerp(okSoft, other.okSoft, t)!,
      warn: Color.lerp(warn, other.warn, t)!,
      warnText: Color.lerp(warnText, other.warnText, t)!,
      warnSoft: Color.lerp(warnSoft, other.warnSoft, t)!,
      bad: Color.lerp(bad, other.bad, t)!,
      badText: Color.lerp(badText, other.badText, t)!,
      badSoft: Color.lerp(badSoft, other.badSoft, t)!,
      shadowCard: Color.lerp(shadowCard, other.shadowCard, t)!,
      shadowRaised: Color.lerp(shadowRaised, other.shadowRaised, t)!,
    );
  }
}

/// وصول مختصر لتوكنز الثيم من أي ودجت.
extension AppColorsContext on BuildContext {
  AppColors get appColors => Theme.of(this).extension<AppColors>()!;
}
