/// بوابة خدمة رسائل الجهاز (FCM) — معزولة خلف واجهة حتى يبقى الريبو
/// قابلاً للاختبار ولا يعتمد على حزمة Firebase مباشرة.
///
/// التنفيذ الحقيقي (firebase_messaging) يهبط عند التفعيل فقط: مشروع
/// Firebase + ملفات الإعداد (google-services.json) + سرّ الخادم — كلها
/// خطوات التفعيل الموثقة في F1-T8. حتى ذلك الحين يعمل DormantPushGateway.
abstract class PushMessagingGateway {
  /// توكن الجهاز الحالي — null عندما لا يتوفر (إذن مرفوض/غير مهيأ).
  Future<String?> currentToken();

  /// بث توكنات متجددة.
  Stream<String> get tokenRefreshes;

  /// طلب إذن الإشعارات من النظام.
  Future<bool> requestPermission();
}

/// تنفيذ نائم مصمم: لا توكن ولا إذن — التطبيق يعمل كأن لا Push،
/// وسطح الإعدادات يعرض حالة «قريبًا» (قاعدة المالك: لا خطأ خام).
class DormantPushGateway implements PushMessagingGateway {
  const DormantPushGateway();

  @override
  Future<String?> currentToken() async => null;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Future<bool> requestPermission() async => false;
}
