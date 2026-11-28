import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/widgets/field_error.dart';

/// غلاف حقل موحّد — نظير `Field` في `ui/form.tsx`:
/// عنوان + عنصر تحكم + خطأ حقل اختياري. محاذاة start/end فقط.
class AppField extends StatelessWidget {
  const AppField({
    required this.label,
    required this.child,
    this.error,
    super.key,
  });

  final String label;
  final Widget child;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13.5, height: 1.6, color: colors.muted),
        ),
        const SizedBox(height: 6),
        child,
        if (error != null) FieldError(message: error!),
      ],
    );
  }
}

/// حقل نصي — نظير `TextInput` في `ui/form.tsx`.
class AppTextField extends StatelessWidget {
  const AppTextField({
    required this.label,
    this.controller,
    this.hint,
    this.error,
    this.keyboardType,
    this.onChanged,
    this.maxLines = 1,
    this.enabled = true,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? error;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final int maxLines;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return AppField(
      label: label,
      error: error,
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        onChanged: onChanged,
        maxLines: maxLines,
        enabled: enabled,
        decoration: InputDecoration(hintText: hint),
      ),
    );
  }
}

/// حقل نصي متعدد الأسطر — نظير `TextArea` في `ui/form.tsx`.
class AppTextArea extends StatelessWidget {
  const AppTextArea({
    required this.label,
    this.controller,
    this.hint,
    this.error,
    this.onChanged,
    this.maxLines = 3,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? error;
  final ValueChanged<String>? onChanged;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: label,
      controller: controller,
      hint: hint,
      error: error,
      onChanged: onChanged,
      maxLines: maxLines,
    );
  }
}

/// قائمة اختيار — نظير `Select` في `ui/form.tsx`.
class AppSelectField<T> extends StatelessWidget {
  const AppSelectField({
    required this.label,
    required this.items,
    this.value,
    this.error,
    this.onChanged,
    super.key,
  });

  final String label;
  final List<DropdownMenuItem<T>> items;
  final T? value;
  final String? error;
  final ValueChanged<T?>? onChanged;

  @override
  Widget build(BuildContext context) {
    return AppField(
      label: label,
      error: error,
      child: DropdownButtonFormField<T>(
        initialValue: value,
        items: items,
        onChanged: onChanged,
        isExpanded: true,
      ),
    );
  }
}
