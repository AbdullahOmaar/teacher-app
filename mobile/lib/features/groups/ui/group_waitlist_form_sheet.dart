import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/core/widgets/field_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/groups/ui/group_waitlist_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// يعرض ورقة إضافة منتظر لقائمة انتظار مجموعة — يعيد true عند حفظ ناجح.
/// عقود v1.2: `GroupsRepository.addWaitlistEntry` (source الافتراضي
/// 'manual' خادميًا — لا يُرسل من العميل).
Future<bool?> showWaitlistFormSheet(
  BuildContext context, {
  required String groupId,
}) {
  return showAppSheet<bool>(
    context,
    child: GroupWaitlistFormSheet(groupId: groupId),
  );
}

/// نموذج إضافة منتظر: اسم (إلزامي) / موبايل / ملاحظة.
/// التحقق فوري قبل الإرسال + FieldError للاسم + FormError للإرسال.
class GroupWaitlistFormSheet extends ConsumerStatefulWidget {
  const GroupWaitlistFormSheet({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupWaitlistFormSheet> createState() =>
      _GroupWaitlistFormSheetState();
}

class _GroupWaitlistFormSheetState
    extends ConsumerState<GroupWaitlistFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _note;
  bool _nameMissing = false;
  String? _formError;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _phone = TextEditingController();
    _note = TextEditingController();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _note.dispose();
    super.dispose();
  }

  String? _blankToNull(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _nameMissing = true);
      return;
    }
    setState(() {
      _submitting = true;
      _formError = null;
    });
    final error = await ref
        .read(groupWaitlistViewModelProvider(widget.groupId).notifier)
        .add(
          WaitlistInput(
            name: _name.text.trim(),
            phone: _blankToNull(_phone),
            note: _blankToNull(_note),
          ),
        );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _submitting = false;
        _formError = error.arbKey;
      });
      return;
    }
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AppSheetScaffold(
      title: l10n.groups_wl_add_btn,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            label: l10n.groups_wl_name_label,
            controller: _name,
            hint: l10n.groups_wl_name_placeholder,
            error: _nameMissing ? l10n.groups_wl_name_required : null,
            onChanged: (_) {
              if (_nameMissing) setState(() => _nameMissing = false);
            },
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.groups_wl_phone_label,
            controller: _phone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          AppTextArea(
            label: l10n.groups_wl_note_label,
            controller: _note,
          ),
          if (_formError != null) ...[
            const SizedBox(height: 12),
            FormError(
              message: localizeAppError(
                l10n,
                AppError(kind: AppErrorKind.unknown, arbKey: _formError!),
              ),
            ),
          ],
          const SizedBox(height: 16),
          AppButton(
            label: l10n.groups_wl_add_btn,
            full: true,
            loading: _submitting,
            onPressed: _submitting ? null : _save,
          ),
        ],
      ),
    );
  }
}
