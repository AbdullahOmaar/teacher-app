import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/core/widgets/field_error.dart';
import 'package:mister/features/students/domain/models/student.dart';
import 'package:mister/features/students/ui/student_form_view_model.dart';
import 'package:mister/features/students/ui/students_list_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// يعرض ورقة نموذج الطالب (إضافة/تعديل) — 4-4 في تفصيل F1-T6.
/// يعيد true عند حفظ ناجح (المستدعي يعرض التنبيه من سياقه الحي).
Future<bool?> showStudentFormSheet(
  BuildContext context, {
  Student? initial,
}) {
  return showAppSheet<bool>(
    context,
    child: StudentFormSheet(initial: initial),
  );
}

/// نموذج طالب داخل ورقة سفلية: اسم/صف/مدرسة/هواتف/مجموعة.
/// التحقق فوري قبل الإرسال + FieldError لكل حقل + FormError للإرسال.
class StudentFormSheet extends ConsumerStatefulWidget {
  const StudentFormSheet({this.initial, super.key});

  /// طالب قائم للتعديل — null = إضافة جديدة.
  final Student? initial;

  @override
  ConsumerState<StudentFormSheet> createState() => _StudentFormSheetState();
}

class _StudentFormSheetState extends ConsumerState<StudentFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _grade;
  late final TextEditingController _school;
  late final TextEditingController _phone;
  late final TextEditingController _guardianName;
  late final TextEditingController _guardianPhone;
  late final TextEditingController _levelNote;
  String? _groupId;
  bool _nameMissing = false;

  String get _studentId => widget.initial?.id ?? '';

  @override
  void initState() {
    super.initState();
    final s = widget.initial;
    _name = TextEditingController(text: s?.name ?? '');
    _grade = TextEditingController(text: s?.grade ?? '');
    _school = TextEditingController(text: s?.school ?? '');
    _phone = TextEditingController(text: s?.phone ?? '');
    _guardianName = TextEditingController(text: s?.guardianName ?? '');
    _guardianPhone = TextEditingController(text: s?.guardianPhone ?? '');
    _levelNote = TextEditingController(text: s?.levelNote ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _grade.dispose();
    _school.dispose();
    _phone.dispose();
    _guardianName.dispose();
    _guardianPhone.dispose();
    _levelNote.dispose();
    super.dispose();
  }

  String? _blankToNull(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _nameMissing = true);
      return;
    }
    await ref.read(studentFormViewModelProvider(_studentId).notifier).submit(
          StudentInput(
            name: _name.text.trim(),
            grade: _blankToNull(_grade),
            school: _blankToNull(_school),
            phone: _blankToNull(_phone),
            guardianName: _blankToNull(_guardianName),
            guardianPhone: _blankToNull(_guardianPhone),
            levelNote: _blankToNull(_levelNote),
          ),
          groupId: _groupId,
        );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final formState = ref.watch(studentFormViewModelProvider(_studentId));

    ref.listen(studentFormViewModelProvider(_studentId), (prev, next) {
      if (next.done && !(prev?.done ?? false)) {
        ref.invalidate(studentsListViewModelProvider);
        Navigator.of(context).pop(true);
      }
    });

    return AppSheetScaffold(
      title: widget.initial == null
          ? l10n.students_add_student
          : l10n.students_form_edit_title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            label: l10n.students_form_name_label,
            controller: _name,
            hint: l10n.students_form_name_placeholder,
            error: _nameMissing ? l10n.students_form_name_required : null,
            onChanged: (_) {
              if (_nameMissing) setState(() => _nameMissing = false);
            },
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_grade_label,
            controller: _grade,
            hint: l10n.students_form_grade_placeholder,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_school_label,
            controller: _school,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_student_phone_label,
            controller: _phone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_guardian_label,
            controller: _guardianName,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_guardian_phone_label,
            controller: _guardianPhone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.students_form_level_note_label,
            controller: _levelNote,
          ),
          const SizedBox(height: 12),
          AppSelectField<String>(
            label: l10n.students_enroll_group_label,
            value: _groupId,
            items: [
              for (final g in formState.groups)
                if (g.archivedAt == null)
                  DropdownMenuItem(value: g.id, child: Text(g.name)),
            ],
            onChanged: (v) => setState(() => _groupId = v),
          ),
          if (formState.formError != null) ...[
            const SizedBox(height: 12),
            FormError(
              message: localizeAppError(
                l10n,
                AppError(
                  kind: AppErrorKind.unknown,
                  arbKey: formState.formError!,
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          AppButton(
            label: widget.initial == null
                ? l10n.students_add_student
                : l10n.groups_form_save,
            full: true,
            loading: formState.submitting,
            onPressed: formState.submitting ? null : _save,
          ),
        ],
      ),
    );
  }
}
