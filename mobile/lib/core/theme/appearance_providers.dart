import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// حالة المظهر — لغة الواجهة ووضع الثيم (حالة واجهة فقط، لا بيانات).
/// اللغة الافتراضية: العربية (ملحق أ L5) — والاتجاه يتبع اللغة دائمًا.
/// الثيم الافتراضي: النظام (نمط الويب `useTheme.ts`: ‏auto/light/dark).
final localeProvider = StateProvider<Locale>((ref) => const Locale('ar'));

final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
