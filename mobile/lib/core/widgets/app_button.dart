import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/theme/app_theme.dart';

/// أنماط الزر الأربعة — نظير `ui/Button.tsx` في الويب.
enum AppButtonVariant { primary, soft, danger, ghost }

/// زر موحّد: هدف لمس 48px، انحناء 12px، نص 15/600.
/// المعطّل بشفافية 50% (نمط الويب `disabled:opacity-50`).
class AppButton extends StatelessWidget {
  const AppButton({
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.full = false,
    this.loading = false,
    this.icon,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool full;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final (bg, fg) = switch (variant) {
      AppButtonVariant.primary => (colors.primary, colors.onPrimary),
      AppButtonVariant.soft => (colors.soft, colors.primaryDark),
      AppButtonVariant.danger => (colors.bad, colors.onPrimary),
      AppButtonVariant.ghost => (Colors.transparent, colors.primary),
    };
    final enabled = onPressed != null && !loading;
    final style = ButtonStyle(
      backgroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return bg.withValues(alpha: 0.5);
        }
        if (states.contains(WidgetState.pressed) &&
            variant == AppButtonVariant.primary) {
          return colors.primaryDark;
        }
        return bg;
      }),
      foregroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return fg.withValues(alpha: 0.5);
        }
        return fg;
      }),
      minimumSize: const WidgetStatePropertyAll(Size(0, 48)),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 16),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      textStyle: const WidgetStatePropertyAll(
        TextStyle(
          fontFamily: AppTheme.fontFamily,
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
      elevation: const WidgetStatePropertyAll(0),
    );

    final child = loading
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  // الخط صراحة: أزرار Material ترسم التسمية بنمطها
                  // الداخلي ولا ترث عائلة خط الثيم دائمًا (درس الشيبس).
                  style: const TextStyle(
                    fontFamily: AppTheme.fontFamily,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          );

    final button = variant == AppButtonVariant.ghost
        ? TextButton(
            style: style,
            onPressed: enabled ? onPressed : null,
            child: child,
          )
        : FilledButton(
            style: style,
            onPressed: enabled ? onPressed : null,
            child: child,
          );

    return full ? SizedBox(width: double.infinity, child: button) : button;
  }
}
