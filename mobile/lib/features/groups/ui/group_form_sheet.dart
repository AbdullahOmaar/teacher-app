import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mister/core/data/current_teacher_provider.dart';
import 'package:mister/core/data/providers.dart';
import 'package:mister/core/error/app_error.dart';
import 'package:mister/core/error/app_error_l10n.dart';
import 'package:mister/core/ui/format.dart';
import 'package:mister/core/widgets/app_button.dart';
import 'package:mister/core/widgets/app_chip.dart';
import 'package:mister/core/widgets/app_sheet.dart';
import 'package:mister/core/widgets/app_text_field.dart';
import 'package:mister/core/widgets/field_error.dart';
import 'package:mister/features/groups/domain/models/group.dart';
import 'package:mister/features/groups/ui/groups_list_view_model.dart';
import 'package:mister/l10n/app_localizations.dart';

/// يعرض ورقة إنشاء مجموعة — يعيد true عند حفظ ناجح.
Future<bool?> showGroupFormSheet(BuildContext context) {
  return showAppSheet<bool>(context, child: const GroupFormSheet());
}

/// نموذج إنشاء مجموعة (تفصيل F1-T6 ‏4-5): اسم/نظام دفع/سعر/أيام/وقت/مدة
/// + تفاصيل إضافية. التحقق فوري بمفاتيح `groups_form_*`.
class GroupFormSheet extends ConsumerStatefulWidget {
  const GroupFormSheet({super.key});

  @override
  ConsumerState<GroupFormSheet> createState() => _GroupFormSheetState();
}

class _GroupFormSheetState extends ConsumerState<GroupFormSheet> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _price = TextEditingController();
  final TextEditingController _startTime = TextEditingController(text: '16:00');
  final TextEditingController _duration = TextEditingController(text: '90');
  final TextEditingController _room = TextEditingController();
  final TextEditingController _capacity = TextEditingController();
  final TextEditingController _assistant = TextEditingController();
  BillingType _billing = BillingType.monthlyFixed;
  final Set<int> _days = {};
  String? _nameError;
  String? _daysError;
  String? _priceError;
  String? _durationError;
  String? _capacityError;
  String? _formError;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _startTime.dispose();
    _duration.dispose();
    _room.dispose();
    _capacity.dispose();
    _assistant.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final price = double.tryParse(_price.text.trim());
    final duration = int.tryParse(_duration.text.trim());
    final capacityText = _capacity.text.trim();
    final capacity = capacityText.isEmpty ? null : int.tryParse(capacityText);
    setState(() {
      _nameError =
          _name.text.trim().isEmpty ? l10n.groups_form_name_required : null;
      _daysError = _days.isEmpty ? l10n.groups_form_days_required : null;
      _priceError =
          (price == null || price < 0) ? l10n.groups_form_price_invalid : null;
      _durationError = (duration == null || duration < 30)
          ? l10n.groups_form_duration_invalid
          : null;
      _capacityError =
          (capacityText.isNotEmpty && (capacity == null || capacity <= 0))
              ? l10n.groups_form_capacity_invalid
              : null;
      _formError = null;
    });
    if (_nameError != null ||
        _daysError != null ||
        _priceError != null ||
        _durationError != null ||
        _capacityError != null) {
      return;
    }
    setState(() => _submitting = true);
    try {
      final teacherId = await ref.read(currentTeacherIdProvider.future);
      final days = _days.toList()..sort();
      await ref.read(groupsRepositoryProvider).create(
            teacherId,
            GroupInput(
              name: _name.text.trim(),
              billingType: _billing,
              price: price!,
              days: days,
              startTime: '${_startTime.text.trim()}:00',
              durationMinutes: duration!,
              room: _room.text.trim().isEmpty ? null : _room.text.trim(),
              capacity: capacity,
              assistantName: _assistant.text.trim().isEmpty
                  ? null
                  : _assistant.text.trim(),
            ),
          );
      ref.invalidate(groupsListViewModelProvider);
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
    return AppSheetScaffold(
      title: l10n.groups_form_create_title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            label: l10n.groups_form_name_label,
            controller: _name,
            hint: l10n.groups_form_name_placeholder,
            error: _nameError,
          ),
          const SizedBox(height: 12),
          AppSelectField<BillingType>(
            label: l10n.groups_form_billing_label,
            value: _billing,
            items: [
              for (final t in BillingType.values)
                DropdownMenuItem(
                  value: t,
                  child: Text(billingTypeLabel(l10n, t)),
                ),
            ],
            onChanged: (v) => setState(() => _billing = v ?? _billing),
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.groups_form_price_label,
            controller: _price,
            keyboardType: TextInputType.number,
            error: _priceError,
          ),
          const SizedBox(height: 12),
          Text(
            l10n.groups_form_days_label,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 6),
          AppChipRow(
            children: [
              for (var d = 0; d < 7; d++)
                AppChip(
                  label: weekdayName(l10n, d),
                  selected: _days.contains(d),
                  onSelected: (sel) => setState(() {
                    if (sel) {
                      _days.add(d);
                    } else {
                      _days.remove(d);
                    }
                    _daysError = null;
                  }),
                ),
            ],
          ),
          if (_daysError != null) FieldError(message: _daysError!),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  label: l10n.groups_form_start_label,
                  controller: _startTime,
                  hint: '16:00',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppTextField(
                  label: l10n.groups_form_duration_label,
                  controller: _duration,
                  keyboardType: TextInputType.number,
                  error: _durationError,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.groups_form_room_label,
            controller: _room,
            hint: l10n.groups_form_room_placeholder,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.groups_form_capacity_label,
            controller: _capacity,
            keyboardType: TextInputType.number,
            error: _capacityError,
          ),
          const SizedBox(height: 12),
          AppTextField(
            label: l10n.groups_form_assistant_label,
            controller: _assistant,
          ),
          if (_formError != null) ...[
            const SizedBox(height: 12),
            FormError(message: _formError!),
          ],
          const SizedBox(height: 16),
          AppButton(
            label: l10n.groups_form_save,
            full: true,
            loading: _submitting,
            onPressed: _submitting ? null : _save,
          ),
        ],
      ),
    );
  }
}
