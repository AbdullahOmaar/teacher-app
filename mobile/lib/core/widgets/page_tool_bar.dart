import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// شريط أدوات الصفحة — نظير `PageToolBar` في `ui/PageToolBar.tsx`:
/// عنوان قسم في البداية + أفعال في النهاية، بلا تكديس.
class PageToolBar extends StatelessWidget {
  const PageToolBar({required this.title, this.actions = const [], super.key});

  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleMedium),
        ),
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          actions[i],
        ],
      ],
    );
  }
}

/// ترويسة مجموعة لاصقة — نظير `StickyGroupHeader` في `ui/PageToolBar.tsx`.
class StickyGroupHeader extends StatelessWidget {
  const StickyGroupHeader({required this.title, super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      width: double.infinity,
      color: colors.bg,
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 6),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: colors.muted,
        ),
      ),
    );
  }
}

/// مندوب لصق ترويسة المجموعة داخل CustomScrollView.
class StickyGroupHeaderDelegate extends SliverPersistentHeaderDelegate {
  StickyGroupHeaderDelegate({required this.title});

  final String title;

  @override
  double get minExtent => 38;

  @override
  double get maxExtent => 38;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return StickyGroupHeader(title: title);
  }

  @override
  bool shouldRebuild(StickyGroupHeaderDelegate oldDelegate) =>
      title != oldDelegate.title;
}
