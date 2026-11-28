import 'package:flutter_test/flutter_test.dart';
import 'package:mister/core/error/app_error.dart';

void main() {
  test('Postgres 23503 maps to deleteBlockedByLinks (عقود §5-2)', () {
    expect(AppError.fromPostgresCode('23503').arbKey, 'common_delete_blocked_by_links');
  });

  test('Postgres 23505 maps to duplicate entry', () {
    expect(AppError.fromPostgresCode('23505').arbKey, 'common_duplicate_entry');
  });

  test('Postgres 42501 maps to no permission', () {
    expect(AppError.fromPostgresCode('42501').arbKey, 'common_no_permission');
  });

  test('Unknown code falls back to common_unexpected_error — never raw', () {
    expect(AppError.fromPostgresCode('99999').arbKey, 'common_unexpected_error');
  });

  test('Network error uses the single unified key', () {
    expect(AppError.network().arbKey, 'common_network_error');
  });
}
