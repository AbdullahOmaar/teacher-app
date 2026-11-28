import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/l10n/app_localizations.dart';

/// أفاتار بالاسم (حرف أول/صورة) — نظير `ui/Avatar.tsx`، الحجم الافتراضي 40.
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    required this.name,
    this.size = 40,
    this.imageUrl,
    super.key,
  });

  final String name;
  final double size;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final trimmed = name.trim();
    final initial = trimmed.isEmpty
        ? AppLocalizations.of(context).components_avatar_fallback
        : trimmed.characters.first;
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: colors.soft,
      backgroundImage: imageUrl != null ? NetworkImage(imageUrl!) : null,
      child: imageUrl == null
          ? Text(
              initial,
              style: TextStyle(
                fontSize: size * 0.45,
                fontWeight: FontWeight.w600,
                color: colors.primaryDark,
              ),
            )
          : null,
    );
  }
}
