import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/l10n/app_localizations.dart';

/// ورقة سفلية موحّدة — نظير `ui/Sheet.tsx` (سطح `--elevated`).
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required Widget child,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => child,
  );
}

/// هيكل الورقة: مقبض سحب + عنوان + زر إغلاق + محتوى قابل للتمرير.
class AppSheetScaffold extends StatelessWidget {
  const AppSheetScaffold({required this.title, required this.child, super.key});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsetsDirectional.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: colors.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: l10n.common_close,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 24),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// ورقة تأكيد فعل خطر — نظير `ui/DangerConfirmSheet.tsx`.
/// مع `entityName` يلزم كتابة الاسم كاملًا قبل تفعيل التأكيد
/// (مفتاح `components_danger_type_name_label`).
class DangerConfirmSheet extends StatefulWidget {
  const DangerConfirmSheet({
    required this.title,
    required this.lines,
    required this.confirmLabel,
    this.entityName,
    super.key,
  });

  final String title;
  final List<String> lines;
  final String confirmLabel;

  /// اسم الكيان المطلوب كتابته للتأكيد — null = تأكيد مباشر.
  final String? entityName;

  @override
  State<DangerConfirmSheet> createState() => _DangerConfirmSheetState();
}

class _DangerConfirmSheetState extends State<DangerConfirmSheet> {
  final TextEditingController _nameController = TextEditingController();
  bool _executing = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _canConfirm =>
      widget.entityName == null ||
      _nameController.text.trim() == widget.entityName;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AppSheetScaffold(
      title: widget.title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final line in widget.lines) ...[
            Text(line, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 8),
          ],
          if (widget.entityName != null) ...[
            const SizedBox(height: 8),
            AppTextField(
              label: l10n.components_danger_type_name_label(widget.entityName!),
              controller: _nameController,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: l10n.components_danger_cancel,
                  variant: AppButtonVariant.ghost,
                  onPressed: _executing
                      ? null
                      : () => Navigator.of(context).pop(false),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AppButton(
                  label: _executing
                      ? l10n.components_danger_executing
                      : widget.confirmLabel,
                  variant: AppButtonVariant.danger,
                  loading: _executing,
                  onPressed: _canConfirm && !_executing
                      ? () async {
                          setState(() => _executing = true);
                          if (context.mounted) {
                            Navigator.of(context).pop(true);
                          }
                        }
                      : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// يعرض ورقة التأكيد ويعيد true عند التأكيد.
Future<bool> showDangerConfirmSheet(
  BuildContext context, {
  required String title,
  required List<String> lines,
  required String confirmLabel,
  String? entityName,
}) async {
  final result = await showAppSheet<bool>(
    context,
    child: DangerConfirmSheet(
      title: title,
      lines: lines,
      confirmLabel: confirmLabel,
      entityName: entityName,
    ),
  );
  return result ?? false;
}
