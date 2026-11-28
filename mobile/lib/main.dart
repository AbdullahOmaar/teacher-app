import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/app_build_info.dart';
import 'package:mister/core/router/app_router.dart';
// import 'package:mister/l10n/app_localizations.dart'; // يُولَّد من ARB في F1-T3 (gen-l10n).

/// نقطة الدخول — هيكل F1-T2.
/// العربية افتراضيًا (قرار منتج موثّق — الملحق أ L5) مع الإنجليزية من الإعدادات.
void main() {
  runApp(const ProviderScope(child: MisterApp()));
}

class MisterApp extends StatelessWidget {
  const MisterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      routerConfig: appRouter,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        // AppLocalizations.delegate, // بعد توليد l10n في F1-T3
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData.light(useMaterial3: true),
      darkTheme: ThemeData.dark(useMaterial3: true),
      debugShowCheckedModeBanner: false,
    );
  }
}

/// سبلاش — سطر الإصدار من بيانات البناء (قاعدة مالك 2026-11-25).
class SplashView extends StatelessWidget {
  const SplashView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('مستر', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Text(AppBuildInfo.releaseLine),
          ],
        ),
      ),
    );
  }
}

/// الشاشات المؤقتة في lib/core/router/placeholder_views.dart —
/// هياكلها الحقيقية عند الخط ب (F1-T3/F1-T6) على عقود F1-T1.
