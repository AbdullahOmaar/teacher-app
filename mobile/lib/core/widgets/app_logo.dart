import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/l10n/app_localizations.dart';

/// العلامة التجارية — نظير `brand/Logo.tsx` في الويب (هناك SVG ثابت؛
/// هنا علامة نصية بسيطة بلا أصول: مربع انحناء 12 بلون الأساسي + حرف «م»).
class AppLogo extends StatelessWidget {
  const AppLogo({this.size = 40, this.showTitle = false, super.key});

  final double size;
  final bool showTitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final l10n = AppLocalizations.of(context);
    final mark = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: colors.primary,
        borderRadius: BorderRadius.circular(12),
      ),
      alignment: Alignment.center,
      child: Text(
        l10n.shell_avatar_fallback,
        style: TextStyle(
          fontSize: size * 0.55,
          fontWeight: FontWeight.w700,
          color: colors.onPrimary,
          height: 1,
        ),
      ),
    );
    if (!showTitle) return mark;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(width: 10),
        Text(
          l10n.components_logo_title,
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ],
    );
  }
}
