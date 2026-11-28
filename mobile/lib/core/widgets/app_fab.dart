import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// زر فعل عائم — نظير `ui/Fab.tsx` (أيقونة Plus افتراضيًا، موضع اتجاهي end).
class AppFab extends StatelessWidget {
  const AppFab({
    required this.onPressed,
    this.icon = Icons.add,
    this.label,
    this.tooltip,
    super.key,
  });

  final VoidCallback onPressed;
  final IconData icon;
  final String? label;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    if (label != null) {
      return FloatingActionButton.extended(
        onPressed: onPressed,
        tooltip: tooltip,
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
        icon: Icon(icon),
        label: Text(label!),
      );
    }
    return FloatingActionButton(
      onPressed: onPressed,
      tooltip: tooltip,
      backgroundColor: colors.primary,
      foregroundColor: colors.onPrimary,
      child: Icon(icon),
    );
  }
}
