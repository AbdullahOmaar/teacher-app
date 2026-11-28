import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/theme/app_theme.dart';

/// رقاقة تصفية — نظير `Chip` في `ui/form.tsx`.
class AppChip extends StatelessWidget {
  const AppChip({
    required this.label,
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    // الخط مضمّن في نمط نص التسمية نفسه: ‏ChoiceChip في هذه النسخة
    // يرسم تسميته بنمط لا يرث عائلة خط الثيم (تظهر مربعات بديلة
    // للحروف العربية)، فالتثبيت الصريح هنا هو الضمان.
    final labelStyle = TextStyle(
      fontFamily: AppTheme.fontFamily,
      fontSize: 13.5,
      color: selected ? colors.primaryDark : colors.text,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
    );
    return ChoiceChip(
      label: Text(label, style: labelStyle),
      selected: selected,
      onSelected: onSelected,
      showCheckmark: false,
      backgroundColor: colors.card,
      selectedColor: colors.soft,
      side: BorderSide(
        color: selected ? colors.primary : colors.borderInteractive,
      ),
      labelStyle: labelStyle,
    );
  }
}

/// صف رقائق أفقي قابل للتمرير — نظير `ChipRow` في `ui/form.tsx`.
/// التمرير أفقي باتجاه القراءة؛ لا قصّ عند الأطراف.
class AppChipRow extends StatelessWidget {
  const AppChipRow({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            children[i],
          ],
        ],
      ),
    );
  }
}
