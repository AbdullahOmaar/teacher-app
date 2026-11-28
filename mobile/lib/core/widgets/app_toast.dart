import 'package:flutter/material.dart';
import 'package:mister/core/theme/app_colors.dart';

/// تنبيه عابر — نظير `ui/Toast.tsx`/`toast.ts` في الويب.
/// يظهر أسفل الشاشة عائمًا ولا يحجب المحتوى.
void showAppToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// تنبيه نجاح عابر — بلهجة كهرمانية محفوظة «للحظات الإنجاز فقط»
/// (توكن `--accent` — جرد التصميم §1/§5).
void showAppSuccessToast(BuildContext context, String message) {
  final colors = context.appColors;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(Icons.check_circle, size: 18, color: colors.accent),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
}
