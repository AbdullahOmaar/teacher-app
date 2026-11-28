import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// لهجات الشارة — حشوة خفيفة + نص بتباين ≥4.5:1 (جرد التصميم §1-2).
enum AppBadgeTone { ok, warn, bad, neutral, primary }

/// شارة حالة صغيرة (12px/600 — عرض فقط، غير تفاعلية).
class AppBadge extends StatelessWidget {
  const AppBadge({
    required this.label,
    this.tone = AppBadgeTone.neutral,
    super.key,
  });

  final String label;
  final AppBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final (bg, fg) = switch (tone) {
      AppBadgeTone.ok => (colors.okSoft, colors.okText),
      AppBadgeTone.warn => (colors.warnSoft, colors.warnText),
      AppBadgeTone.bad => (colors.badSoft, colors.badText),
      AppBadgeTone.neutral => (colors.soft, colors.muted),
      AppBadgeTone.primary => (colors.soft, colors.primaryDark),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          height: 1.5,
          color: fg,
        ),
      ),
    );
  }
}
