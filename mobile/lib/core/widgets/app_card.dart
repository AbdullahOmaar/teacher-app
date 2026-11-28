import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// بطاقة أساسية — نظير `ui/Card.tsx`: سطح `--card`، انحناء 12px،
/// حد زخرفي + ظل البطاقة الوحيد في النظام.
class AppCard extends StatelessWidget {
  const AppCard({required this.child, this.padding, this.onTap, super.key});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final content = Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border),
        boxShadow: colors.cardShadow,
      ),
      child: child,
    );
    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: content,
    );
  }
}
