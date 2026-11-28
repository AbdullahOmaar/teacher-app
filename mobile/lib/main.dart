import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/app_build_info.dart';
import 'package:mister/core/data/app_database.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/data/secure_storage_service.dart';
import 'package:mister/core/data/supabase_service.dart';
import 'package:mister/core/router/app_router.dart';
import 'package:mister/core/theme/app_theme.dart';
import 'package:mister/core/theme/appearance_providers.dart';
import 'package:mister/l10n/app_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// نقطة الدخول — هيكل F1-T2 + إقلاع F1-T5.
/// العربية افتراضيًا (قرار منتج موثّق — الملحق أ L5) مع الإنجليزية من الإعدادات.
/// إقلاع Supabase: PKCE + جلسة في المخزن الآمن (MASVS) — من dart-define فقط.
/// بلا إعدادات بيئة (بناء دخاني) يُقلع التطبيق بلا عميل؛ البوابات تتحقق محليًا.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (AppConfig.supabaseUrl.isNotEmpty) {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
      authOptions: FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
        localStorage: SecureGoTrueStorage(),
      ),
    );
  }
  final db = await AppDatabase.openOnDevice();
  runApp(
    ProviderScope(
      overrides: [appDatabaseProvider.overrideWithValue(db)],
      child: const MisterApp(),
    ),
  );
}

class MisterApp extends ConsumerWidget {
  const MisterApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      routerConfig: appRouter,
      locale: ref.watch(localeProvider),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
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
            const Text('مستر',
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),),
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
