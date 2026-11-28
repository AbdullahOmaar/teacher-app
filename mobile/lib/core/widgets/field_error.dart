import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// خطأ حقل واحد — نظير `FieldError` في `ui/form.tsx`.
class FieldError extends StatelessWidget {
  const FieldError({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 14, color: colors.badText),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              message,
              style:
                  TextStyle(fontSize: 12, height: 1.5, color: colors.badText),
            ),
          ),
        ],
      ),
    );
  }
}

/// خطأ نموذج عام — نظير `FormError` في `ui/form.tsx` (خلفية `--bad-soft`).
class FormError extends StatelessWidget {
  const FormError({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.badSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: colors.badText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style:
                  TextStyle(fontSize: 13.5, height: 1.6, color: colors.badText),
            ),
          ),
        ],
      ),
    );
  }
}
