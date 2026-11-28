import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/core/widgets/field_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/schedule/domain/models/session.dart';
import 'package:mister/features/schedule/ui/schedule_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// يعرض ورقة حصة إضافية — يعيد true عند إضافة ناجحة.
Future<bool?> showExtraSessionSheet(BuildContext context) {
  return showAppSheet<bool>(context, child: const ExtraSessionSheet());
}

/// نموذج حصة إضافية/مراجعة (تفصيل F1-T6 ‏4-8): مجموعة/تاريخ/ميعاد/مدة/ملحوظة.
/// التاريخ والميعاد بمنتقيات النظام؛ التحقق بمفاتيح `schedule_extra_*`.
class ExtraSessionSheet extends ConsumerStatefulWidget {
  const ExtraSessionSheet({super.key});

  @override
  ConsumerState<ExtraSessionSheet> createState() => _ExtraSessionSheetState();
}

class _ExtraSessionSheetState extends ConsumerState<ExtraSessionSheet> {
  final TextEditingController _duration = TextEditingController(text: '90');
  final TextEditingController _note = TextEditingController();
  List<Group> _groups = [];
  String? _groupId;
  DateTime? _date;
  TimeOfDay? _time;
  String? _groupError;
  String? _dateError;
  String? _timeError;
  String? _durationError;
  String? _formError;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  @override
  void dispose() {
    _duration.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadGroups() async {
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final groups = await ref.read(groupsRepositoryProvider).list(teacherId);
      if (mounted) {
        setState(
          () => _groups = groups.where((g) => g.archivedAt == null).toList(),
        );
      }
    } catch (_) {
      // بلا مجموعات يعرض النموذج رسالة «لا مجموعات» من القاموس.
    }
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final duration = int.tryParse(_duration.text.trim());
    setState(() {
      _groupError =
          _groupId == null ? l10n.schedule_extra_group_required : null;
      _dateError = _date == null ? l10n.schedule_extra_date_required : null;
      _timeError = _time == null ? l10n.schedule_extra_time_required : null;
      _durationError = (duration == null || duration <= 0)
          ? l10n.schedule_extra_duration_invalid
          : null;
      _formError = null;
    });
    if (_groupError != null ||
        _dateError != null ||
        _timeError != null ||
        _durationError != null) {
      return;
    }
    setState(() => _submitting = true);
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final time =
          '${_time!.hour.toString().padLeft(2, '0')}:${_time!.minute.toString().padLeft(2, '0')}';
      await ref.read(scheduleRepositoryProvider).createExtraSession(
            teacherId,
            ExtraSessionInput(
              groupId: _groupId!,
              sessionDate: _date!,
              startTime: time,
              durationMinutes: duration!,
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            ),
          );
      ref.invalidate(scheduleViewModelProvider);
      if (mounted) Navigator.of(context).pop(true);
    } on AppError catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _formError = localizeAppError(l10n, e);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _formError = l10n.common_unexpected_error;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toString();
    return AppSheetScaffold(
      title: l10n.schedule_extra_title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_groups.isEmpty)
            Text(
              l10n.schedule_extra_no_groups,
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            AppSelectField<String>(
              label: l10n.schedule_extra_group_label,
              value: _groupId,
              error: _groupError,
              items: [
                for (final g in _groups)
                  DropdownMenuItem(value: g.id, child: Text(g.name)),
              ],
              onChanged: (v) => setState(() => _groupId = v),
            ),
          const SizedBox(height: 12),
          AppField(
            label: l10n.schedule_extra_date_label,
            error: _dateError,
            child: OutlinedButton(
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now().subtract(const Duration(days: 30)),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _date = picked);
              },
              child: Text(
                _date == null
                    ? l10n.schedule_extra_date_required
                    : DateFormat.yMMMMd(locale).format(_date!),
              ),
            ),
          ),
          const SizedBox(height: 12),
          AppField(
            label: l10n.schedule_extra_time_label,
            error: _timeError,
            child: OutlinedButton(
              onPressed: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: const TimeOfDay(hour: 16, minute: 0),
                );
                if (picked != null) setState(() => _time = picked);
              },
              child: Text(
                _time == null
                    ? l10n.schedule_extra_time_required
                    : _time!.format(context),
              ),
            ),
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.schedule_extra_duration_label,
            controller: _duration,
            keyboardType: TextInputType.number,
            error: _durationError,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.schedule_extra_note_label,
            controller: _note,
            hint: l10n.schedule_extra_note_placeholder,
          ),
          if (_formError != null) ...[
            const SizedBox(height: 12),
            FormError(message: _formError!),
          ],
          const SizedBox(height: 16),
          AppButton(
            label: l10n.schedule_extra_add_btn,
            full: true,
            loading: _submitting,
            onPressed: _submitting ? null : _save,
          ),
        ],
      ),
    );
  }
}
