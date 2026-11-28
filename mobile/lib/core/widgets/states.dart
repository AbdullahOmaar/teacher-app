import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/l10n/app_localizations.dart';

/// حالات الشاشة الموحدة — نظير `ui/states.tsx` + `ui/EmptyState.tsx` في الويب
/// (جرد التصميم §5): تحميل بهيكل المحتوى، فراغ مهذب، خطأ مهذب + إعادة محاولة
/// دائمة، ونايم بحالة مصممة «قريبًا» — صفر تفاصيل تقنية وصفر خطأ خام.

/// نبض هيكل التحميل (نمط الويب `animate-pulse` على `--soft`).
class SkeletonPulse extends StatefulWidget {
  const SkeletonPulse({required this.child, super.key});

  final Widget child;

  @override
  State<SkeletonPulse> createState() => _SkeletonPulseState();
}

class _SkeletonPulseState extends State<SkeletonPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_controller),
      child: widget.child,
    );
  }
}

/// كتلة هيكل واحدة بلون `--soft`.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    this.width,
    this.height = 14,
    this.radius = 8,
    super.key,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.appColors.soft,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// هيكل صفوف قائمة: أفاتار + سطران (نمط الويب `SkeletonRows`).
class SkeletonRows extends StatelessWidget {
  const SkeletonRows({this.count = 5, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    return SkeletonPulse(
      child: Column(
        children: [
          for (var i = 0; i < count; i++)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  SkeletonBox(width: 40, height: 40, radius: 999),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 140),
                        SizedBox(height: 8),
                        SkeletonBox(width: 90, height: 10),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// هيكل بطاقات 88px (نمط الويب `SkeletonCards`).
class SkeletonCards extends StatelessWidget {
  const SkeletonCards({this.count = 3, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    return SkeletonPulse(
      child: Column(
        children: [
          for (var i = 0; i < count; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            const SkeletonBox(height: 88, radius: 16),
          ],
        ],
      ),
    );
  }
}

/// حالة تحميل شاشة كاملة بهيكل بطاقات.
class LoadingState extends StatelessWidget {
  const LoadingState({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(16),
      child: SkeletonCards(),
    );
  }
}

/// حالة فراغ — أيقونة في دائرة `--soft` + عنوان + إرشاد + زر اختياري
/// (نمط الويب `EmptyState` — لا إيموجي نهائيًا).
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    this.hint,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? hint;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration:
                BoxDecoration(color: colors.soft, shape: BoxShape.circle),
            child: Icon(icon, size: 28, color: colors.primary),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: theme.textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          if (hint != null) ...[
            const SizedBox(height: 6),
            Text(
              hint!,
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 16),
            AppButton(label: actionLabel!, onPressed: onAction),
          ],
        ],
      ),
    );
  }
}

/// حالة خطأ تحميل — أيقونة في دائرة `--bad-soft` + عنوان + رسالة مهذبة
/// (مترجمة بمفتاح ARB فقط) + زر إعادة محاولة دائم (نمط الويب `ErrorState`).
class ErrorState extends StatelessWidget {
  const ErrorState({required this.message, required this.onRetry, super.key});

  /// رسالة مهذبة مترجمة مسبقًا من مفتاح ARB — لا نص خام أبدًا.
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration:
                BoxDecoration(color: colors.badSoft, shape: BoxShape.circle),
            child: Icon(Icons.error_outline, size: 28, color: colors.badText),
          ),
          const SizedBox(height: 12),
          Text(
            l10n.common_error_title,
            style: theme.textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: theme.textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          AppButton(
            label: l10n.common_retry,
            icon: Icons.refresh,
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}

/// لا جلسة — قفل + توجيه للدخول (نمط الويب `SignInRequired`:
/// «لا بيانات وهمية أبدًا»).
class SignInRequired extends StatelessWidget {
  const SignInRequired({required this.onSignIn, super.key});

  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return EmptyState(
      icon: Icons.lock_outline,
      title: l10n.common_sign_in_first,
      hint: l10n.common_sign_in_first_body,
      actionLabel: l10n.common_sign_in,
      onAction: onSignIn,
    );
  }
}

/// لا ملف مدرّس مرتبط بالحساب (نمط الويب `NoTeacherProfile`).
class NoTeacherProfile extends StatelessWidget {
  const NoTeacherProfile({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return EmptyState(
      icon: Icons.school_outlined,
      title: l10n.common_no_teacher_title,
      hint: l10n.common_no_teacher_body,
    );
  }
}

/// حالة نايم/غير مُطلق مصممة — «قريبًا» مهذبة، ممنوع خطأ خام
/// (قاعدة مالك 2026-11-26؛ سابقة الويب `students.detailComingSoonTitle`).
class ComingSoonState extends StatelessWidget {
  const ComingSoonState({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return EmptyState(
      icon: Icons.schedule_outlined,
      title: l10n.students_detail_coming_soon_title,
    );
  }
}
