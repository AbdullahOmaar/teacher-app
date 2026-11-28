import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// ثيم التطبيق — مبني من توكنز الويب حرفيًا (جرد نظام التصميم §1–§3).
/// الخط: IBM Plex Sans Arabic مضمّن محليًا (أوزان 400–700 فقط —
/// وزن 800 غير موجود كملف ولا يُدَّعى؛ عنوان الشاشة على 700 كالويب تركيبيًا).
/// سلّم الخط الموحّد: screen ‏20/700 · section ‏16/700 · body ‏15/1.75 ·
/// secondary ‏13.5/1.7 · badge ‏12/600. الأرقام جدولية (tabular-nums).
class AppTheme {
  const AppTheme._();

  static const String fontFamily = 'IBM Plex Sans Arabic';

  static const TextStyle _screen =
      TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.6);
  static const TextStyle _section =
      TextStyle(fontSize: 16, fontWeight: FontWeight.w700, height: 1.7);
  static const TextStyle _body = TextStyle(
    fontSize: 15,
    height: 1.75,
    fontFeatures: [FontFeature.tabularFigures()],
  );
  static const TextStyle _secondary = TextStyle(fontSize: 13.5, height: 1.7);
  static const TextStyle _badge =
      TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1.5);

  static TextTheme _textTheme(Color text, Color muted) {
    return TextTheme(
      titleLarge: _screen.copyWith(color: text),
      titleMedium: _section.copyWith(color: text),
      titleSmall: _section.copyWith(color: text, fontSize: 14),
      bodyLarge: _body.copyWith(color: text),
      bodyMedium: _body.copyWith(color: text),
      bodySmall: _secondary.copyWith(color: muted),
      labelLarge: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        height: 1.4,
        fontFeatures: [FontFeature.tabularFigures()],
      ).copyWith(color: text),
      labelMedium: _badge.copyWith(color: muted),
      labelSmall: _badge.copyWith(color: muted, fontSize: 11),
    );
  }

  static ThemeData light() => _build(AppColors.light, Brightness.light);

  static ThemeData dark() => _build(AppColors.dark, Brightness.dark);

  static ThemeData _build(AppColors c, Brightness brightness) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.soft,
      onPrimaryContainer: c.text,
      secondary: c.primaryDark,
      onSecondary: c.onPrimary,
      secondaryContainer: c.soft,
      onSecondaryContainer: c.text,
      tertiary: c.accent,
      onTertiary: c.text,
      error: c.bad,
      onError: c.onPrimary,
      errorContainer: c.badSoft,
      onErrorContainer: c.badText,
      surface: c.card,
      onSurface: c.text,
      surfaceContainerLowest: c.card,
      surfaceContainerLow: c.bg,
      surfaceContainer: c.soft,
      surfaceContainerHigh: c.elevated,
      onSurfaceVariant: c.muted,
      outline: c.border,
      outlineVariant: c.border,
      shadow: c.shadowRaised,
      scrim: Colors.black54,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: fontFamily,
      scaffoldBackgroundColor: c.bg,
      extensions: [c],
      textTheme: _textTheme(c.text, c.muted),
      appBarTheme: AppBarTheme(
        backgroundColor: c.bg,
        foregroundColor: c.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleTextStyle: _section.copyWith(color: c.text, fontFamily: fontFamily),
      ),
      cardTheme: CardThemeData(
        color: c.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: c.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.card,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        hintStyle: _secondary.copyWith(color: c.muted),
        labelStyle: _secondary.copyWith(color: c.muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.borderInteractive),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.borderInteractive),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.bad),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.bad, width: 1.5),
        ),
        errorStyle: TextStyle(color: c.badText, fontSize: 12, height: 1.5),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.elevated,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.soft,
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontFamily: fontFamily,
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? c.primary : c.muted,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? c.primary : c.muted);
        }),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.card,
        selectedColor: c.soft,
        side: BorderSide(color: c.borderInteractive),
        labelStyle: _secondary.copyWith(color: c.text, fontFamily: fontFamily),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: c.text,
        contentTextStyle:
            _secondary.copyWith(color: c.bg, fontFamily: fontFamily),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      dividerTheme: DividerThemeData(color: c.border, thickness: 1),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary),
    );
  }
}
