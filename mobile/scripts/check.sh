#!/usr/bin/env bash
# بوابة الفحص المحلية — نظير `npm run check` في الويب (الملحق أ أ-4).
# الاستخدام: ./scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

flutter pub get
flutter gen-l10n
node scripts/check-arb.mjs
flutter analyze
flutter test

echo "check: OK"
