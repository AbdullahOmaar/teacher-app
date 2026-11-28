// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $CachedEntitiesTable extends CachedEntities
    with TableInfo<$CachedEntitiesTable, CachedEntity> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedEntitiesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _entityMeta = const VerificationMeta('entity');
  @override
  late final GeneratedColumn<String> entity = GeneratedColumn<String>(
      'entity', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _teacherIdMeta =
      const VerificationMeta('teacherId');
  @override
  late final GeneratedColumn<String> teacherId = GeneratedColumn<String>(
      'teacher_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadMeta =
      const VerificationMeta('payload');
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
      'payload', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _cachedAtMeta =
      const VerificationMeta('cachedAt');
  @override
  late final GeneratedColumn<DateTime> cachedAt = GeneratedColumn<DateTime>(
      'cached_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [entity, id, teacherId, payload, cachedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_entities';
  @override
  VerificationContext validateIntegrity(Insertable<CachedEntity> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('entity')) {
      context.handle(_entityMeta,
          entity.isAcceptableOrUnknown(data['entity']!, _entityMeta));
    } else if (isInserting) {
      context.missing(_entityMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('teacher_id')) {
      context.handle(_teacherIdMeta,
          teacherId.isAcceptableOrUnknown(data['teacher_id']!, _teacherIdMeta));
    } else if (isInserting) {
      context.missing(_teacherIdMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(_payloadMeta,
          payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta));
    } else if (isInserting) {
      context.missing(_payloadMeta);
    }
    if (data.containsKey('cached_at')) {
      context.handle(_cachedAtMeta,
          cachedAt.isAcceptableOrUnknown(data['cached_at']!, _cachedAtMeta));
    } else if (isInserting) {
      context.missing(_cachedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {entity, id};
  @override
  CachedEntity map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedEntity(
      entity: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}entity'])!,
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      teacherId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}teacher_id'])!,
      payload: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload'])!,
      cachedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}cached_at'])!,
    );
  }

  @override
  $CachedEntitiesTable createAlias(String alias) {
    return $CachedEntitiesTable(attachedDatabase, alias);
  }
}

class CachedEntity extends DataClass implements Insertable<CachedEntity> {
  /// 'session' | 'student' | 'group'
  final String entity;
  final String id;
  final String teacherId;
  final String payload;
  final DateTime cachedAt;
  const CachedEntity(
      {required this.entity,
      required this.id,
      required this.teacherId,
      required this.payload,
      required this.cachedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['entity'] = Variable<String>(entity);
    map['id'] = Variable<String>(id);
    map['teacher_id'] = Variable<String>(teacherId);
    map['payload'] = Variable<String>(payload);
    map['cached_at'] = Variable<DateTime>(cachedAt);
    return map;
  }

  CachedEntitiesCompanion toCompanion(bool nullToAbsent) {
    return CachedEntitiesCompanion(
      entity: Value(entity),
      id: Value(id),
      teacherId: Value(teacherId),
      payload: Value(payload),
      cachedAt: Value(cachedAt),
    );
  }

  factory CachedEntity.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedEntity(
      entity: serializer.fromJson<String>(json['entity']),
      id: serializer.fromJson<String>(json['id']),
      teacherId: serializer.fromJson<String>(json['teacherId']),
      payload: serializer.fromJson<String>(json['payload']),
      cachedAt: serializer.fromJson<DateTime>(json['cachedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'entity': serializer.toJson<String>(entity),
      'id': serializer.toJson<String>(id),
      'teacherId': serializer.toJson<String>(teacherId),
      'payload': serializer.toJson<String>(payload),
      'cachedAt': serializer.toJson<DateTime>(cachedAt),
    };
  }

  CachedEntity copyWith(
          {String? entity,
          String? id,
          String? teacherId,
          String? payload,
          DateTime? cachedAt}) =>
      CachedEntity(
        entity: entity ?? this.entity,
        id: id ?? this.id,
        teacherId: teacherId ?? this.teacherId,
        payload: payload ?? this.payload,
        cachedAt: cachedAt ?? this.cachedAt,
      );
  CachedEntity copyWithCompanion(CachedEntitiesCompanion data) {
    return CachedEntity(
      entity: data.entity.present ? data.entity.value : this.entity,
      id: data.id.present ? data.id.value : this.id,
      teacherId: data.teacherId.present ? data.teacherId.value : this.teacherId,
      payload: data.payload.present ? data.payload.value : this.payload,
      cachedAt: data.cachedAt.present ? data.cachedAt.value : this.cachedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedEntity(')
          ..write('entity: $entity, ')
          ..write('id: $id, ')
          ..write('teacherId: $teacherId, ')
          ..write('payload: $payload, ')
          ..write('cachedAt: $cachedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(entity, id, teacherId, payload, cachedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedEntity &&
          other.entity == this.entity &&
          other.id == this.id &&
          other.teacherId == this.teacherId &&
          other.payload == this.payload &&
          other.cachedAt == this.cachedAt);
}

class CachedEntitiesCompanion extends UpdateCompanion<CachedEntity> {
  final Value<String> entity;
  final Value<String> id;
  final Value<String> teacherId;
  final Value<String> payload;
  final Value<DateTime> cachedAt;
  final Value<int> rowid;
  const CachedEntitiesCompanion({
    this.entity = const Value.absent(),
    this.id = const Value.absent(),
    this.teacherId = const Value.absent(),
    this.payload = const Value.absent(),
    this.cachedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedEntitiesCompanion.insert({
    required String entity,
    required String id,
    required String teacherId,
    required String payload,
    required DateTime cachedAt,
    this.rowid = const Value.absent(),
  })  : entity = Value(entity),
        id = Value(id),
        teacherId = Value(teacherId),
        payload = Value(payload),
        cachedAt = Value(cachedAt);
  static Insertable<CachedEntity> custom({
    Expression<String>? entity,
    Expression<String>? id,
    Expression<String>? teacherId,
    Expression<String>? payload,
    Expression<DateTime>? cachedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (entity != null) 'entity': entity,
      if (id != null) 'id': id,
      if (teacherId != null) 'teacher_id': teacherId,
      if (payload != null) 'payload': payload,
      if (cachedAt != null) 'cached_at': cachedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedEntitiesCompanion copyWith(
      {Value<String>? entity,
      Value<String>? id,
      Value<String>? teacherId,
      Value<String>? payload,
      Value<DateTime>? cachedAt,
      Value<int>? rowid}) {
    return CachedEntitiesCompanion(
      entity: entity ?? this.entity,
      id: id ?? this.id,
      teacherId: teacherId ?? this.teacherId,
      payload: payload ?? this.payload,
      cachedAt: cachedAt ?? this.cachedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (entity.present) {
      map['entity'] = Variable<String>(entity.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (teacherId.present) {
      map['teacher_id'] = Variable<String>(teacherId.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    if (cachedAt.present) {
      map['cached_at'] = Variable<DateTime>(cachedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedEntitiesCompanion(')
          ..write('entity: $entity, ')
          ..write('id: $id, ')
          ..write('teacherId: $teacherId, ')
          ..write('payload: $payload, ')
          ..write('cachedAt: $cachedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AttendanceQueueItemsTable extends AttendanceQueueItems
    with TableInfo<$AttendanceQueueItemsTable, AttendanceQueueItem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttendanceQueueItemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _teacherIdMeta =
      const VerificationMeta('teacherId');
  @override
  late final GeneratedColumn<String> teacherId = GeneratedColumn<String>(
      'teacher_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sessionIdMeta =
      const VerificationMeta('sessionId');
  @override
  late final GeneratedColumn<String> sessionId = GeneratedColumn<String>(
      'session_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _studentIdMeta =
      const VerificationMeta('studentId');
  @override
  late final GeneratedColumn<String> studentId = GeneratedColumn<String>(
      'student_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _payloadMeta =
      const VerificationMeta('payload');
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
      'payload', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _queuedAtMeta =
      const VerificationMeta('queuedAt');
  @override
  late final GeneratedColumn<DateTime> queuedAt = GeneratedColumn<DateTime>(
      'queued_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _attemptsMeta =
      const VerificationMeta('attempts');
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
      'attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _lastErrorMeta =
      const VerificationMeta('lastError');
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
      'last_error', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _failedMeta = const VerificationMeta('failed');
  @override
  late final GeneratedColumn<bool> failed = GeneratedColumn<bool>(
      'failed', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("failed" IN (0, 1))'),
      defaultValue: const Constant(false));
  @override
  List<GeneratedColumn> get $columns => [
        key,
        teacherId,
        sessionId,
        studentId,
        payload,
        queuedAt,
        attempts,
        lastError,
        failed
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attendance_queue_items';
  @override
  VerificationContext validateIntegrity(
      Insertable<AttendanceQueueItem> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
          _keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('teacher_id')) {
      context.handle(_teacherIdMeta,
          teacherId.isAcceptableOrUnknown(data['teacher_id']!, _teacherIdMeta));
    } else if (isInserting) {
      context.missing(_teacherIdMeta);
    }
    if (data.containsKey('session_id')) {
      context.handle(_sessionIdMeta,
          sessionId.isAcceptableOrUnknown(data['session_id']!, _sessionIdMeta));
    } else if (isInserting) {
      context.missing(_sessionIdMeta);
    }
    if (data.containsKey('student_id')) {
      context.handle(_studentIdMeta,
          studentId.isAcceptableOrUnknown(data['student_id']!, _studentIdMeta));
    } else if (isInserting) {
      context.missing(_studentIdMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(_payloadMeta,
          payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta));
    } else if (isInserting) {
      context.missing(_payloadMeta);
    }
    if (data.containsKey('queued_at')) {
      context.handle(_queuedAtMeta,
          queuedAt.isAcceptableOrUnknown(data['queued_at']!, _queuedAtMeta));
    } else if (isInserting) {
      context.missing(_queuedAtMeta);
    }
    if (data.containsKey('attempts')) {
      context.handle(_attemptsMeta,
          attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));
    }
    if (data.containsKey('last_error')) {
      context.handle(_lastErrorMeta,
          lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta));
    }
    if (data.containsKey('failed')) {
      context.handle(_failedMeta,
          failed.isAcceptableOrUnknown(data['failed']!, _failedMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  AttendanceQueueItem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AttendanceQueueItem(
      key: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      teacherId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}teacher_id'])!,
      sessionId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}session_id'])!,
      studentId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}student_id'])!,
      payload: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload'])!,
      queuedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}queued_at'])!,
      attempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}attempts'])!,
      lastError: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}last_error']),
      failed: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}failed'])!,
    );
  }

  @override
  $AttendanceQueueItemsTable createAlias(String alias) {
    return $AttendanceQueueItemsTable(attachedDatabase, alias);
  }
}

class AttendanceQueueItem extends DataClass
    implements Insertable<AttendanceQueueItem> {
  final String key;
  final String teacherId;
  final String sessionId;
  final String studentId;
  final String payload;
  final DateTime queuedAt;
  final int attempts;
  final String? lastError;
  final bool failed;
  const AttendanceQueueItem(
      {required this.key,
      required this.teacherId,
      required this.sessionId,
      required this.studentId,
      required this.payload,
      required this.queuedAt,
      required this.attempts,
      this.lastError,
      required this.failed});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['teacher_id'] = Variable<String>(teacherId);
    map['session_id'] = Variable<String>(sessionId);
    map['student_id'] = Variable<String>(studentId);
    map['payload'] = Variable<String>(payload);
    map['queued_at'] = Variable<DateTime>(queuedAt);
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['failed'] = Variable<bool>(failed);
    return map;
  }

  AttendanceQueueItemsCompanion toCompanion(bool nullToAbsent) {
    return AttendanceQueueItemsCompanion(
      key: Value(key),
      teacherId: Value(teacherId),
      sessionId: Value(sessionId),
      studentId: Value(studentId),
      payload: Value(payload),
      queuedAt: Value(queuedAt),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      failed: Value(failed),
    );
  }

  factory AttendanceQueueItem.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AttendanceQueueItem(
      key: serializer.fromJson<String>(json['key']),
      teacherId: serializer.fromJson<String>(json['teacherId']),
      sessionId: serializer.fromJson<String>(json['sessionId']),
      studentId: serializer.fromJson<String>(json['studentId']),
      payload: serializer.fromJson<String>(json['payload']),
      queuedAt: serializer.fromJson<DateTime>(json['queuedAt']),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      failed: serializer.fromJson<bool>(json['failed']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'teacherId': serializer.toJson<String>(teacherId),
      'sessionId': serializer.toJson<String>(sessionId),
      'studentId': serializer.toJson<String>(studentId),
      'payload': serializer.toJson<String>(payload),
      'queuedAt': serializer.toJson<DateTime>(queuedAt),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'failed': serializer.toJson<bool>(failed),
    };
  }

  AttendanceQueueItem copyWith(
          {String? key,
          String? teacherId,
          String? sessionId,
          String? studentId,
          String? payload,
          DateTime? queuedAt,
          int? attempts,
          Value<String?> lastError = const Value.absent(),
          bool? failed}) =>
      AttendanceQueueItem(
        key: key ?? this.key,
        teacherId: teacherId ?? this.teacherId,
        sessionId: sessionId ?? this.sessionId,
        studentId: studentId ?? this.studentId,
        payload: payload ?? this.payload,
        queuedAt: queuedAt ?? this.queuedAt,
        attempts: attempts ?? this.attempts,
        lastError: lastError.present ? lastError.value : this.lastError,
        failed: failed ?? this.failed,
      );
  AttendanceQueueItem copyWithCompanion(AttendanceQueueItemsCompanion data) {
    return AttendanceQueueItem(
      key: data.key.present ? data.key.value : this.key,
      teacherId: data.teacherId.present ? data.teacherId.value : this.teacherId,
      sessionId: data.sessionId.present ? data.sessionId.value : this.sessionId,
      studentId: data.studentId.present ? data.studentId.value : this.studentId,
      payload: data.payload.present ? data.payload.value : this.payload,
      queuedAt: data.queuedAt.present ? data.queuedAt.value : this.queuedAt,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      failed: data.failed.present ? data.failed.value : this.failed,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceQueueItem(')
          ..write('key: $key, ')
          ..write('teacherId: $teacherId, ')
          ..write('sessionId: $sessionId, ')
          ..write('studentId: $studentId, ')
          ..write('payload: $payload, ')
          ..write('queuedAt: $queuedAt, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('failed: $failed')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, teacherId, sessionId, studentId, payload,
      queuedAt, attempts, lastError, failed);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AttendanceQueueItem &&
          other.key == this.key &&
          other.teacherId == this.teacherId &&
          other.sessionId == this.sessionId &&
          other.studentId == this.studentId &&
          other.payload == this.payload &&
          other.queuedAt == this.queuedAt &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.failed == this.failed);
}

class AttendanceQueueItemsCompanion
    extends UpdateCompanion<AttendanceQueueItem> {
  final Value<String> key;
  final Value<String> teacherId;
  final Value<String> sessionId;
  final Value<String> studentId;
  final Value<String> payload;
  final Value<DateTime> queuedAt;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<bool> failed;
  final Value<int> rowid;
  const AttendanceQueueItemsCompanion({
    this.key = const Value.absent(),
    this.teacherId = const Value.absent(),
    this.sessionId = const Value.absent(),
    this.studentId = const Value.absent(),
    this.payload = const Value.absent(),
    this.queuedAt = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.failed = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AttendanceQueueItemsCompanion.insert({
    required String key,
    required String teacherId,
    required String sessionId,
    required String studentId,
    required String payload,
    required DateTime queuedAt,
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.failed = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : key = Value(key),
        teacherId = Value(teacherId),
        sessionId = Value(sessionId),
        studentId = Value(studentId),
        payload = Value(payload),
        queuedAt = Value(queuedAt);
  static Insertable<AttendanceQueueItem> custom({
    Expression<String>? key,
    Expression<String>? teacherId,
    Expression<String>? sessionId,
    Expression<String>? studentId,
    Expression<String>? payload,
    Expression<DateTime>? queuedAt,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<bool>? failed,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (teacherId != null) 'teacher_id': teacherId,
      if (sessionId != null) 'session_id': sessionId,
      if (studentId != null) 'student_id': studentId,
      if (payload != null) 'payload': payload,
      if (queuedAt != null) 'queued_at': queuedAt,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (failed != null) 'failed': failed,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AttendanceQueueItemsCompanion copyWith(
      {Value<String>? key,
      Value<String>? teacherId,
      Value<String>? sessionId,
      Value<String>? studentId,
      Value<String>? payload,
      Value<DateTime>? queuedAt,
      Value<int>? attempts,
      Value<String?>? lastError,
      Value<bool>? failed,
      Value<int>? rowid}) {
    return AttendanceQueueItemsCompanion(
      key: key ?? this.key,
      teacherId: teacherId ?? this.teacherId,
      sessionId: sessionId ?? this.sessionId,
      studentId: studentId ?? this.studentId,
      payload: payload ?? this.payload,
      queuedAt: queuedAt ?? this.queuedAt,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      failed: failed ?? this.failed,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (teacherId.present) {
      map['teacher_id'] = Variable<String>(teacherId.value);
    }
    if (sessionId.present) {
      map['session_id'] = Variable<String>(sessionId.value);
    }
    if (studentId.present) {
      map['student_id'] = Variable<String>(studentId.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    if (queuedAt.present) {
      map['queued_at'] = Variable<DateTime>(queuedAt.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (failed.present) {
      map['failed'] = Variable<bool>(failed.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceQueueItemsCompanion(')
          ..write('key: $key, ')
          ..write('teacherId: $teacherId, ')
          ..write('sessionId: $sessionId, ')
          ..write('studentId: $studentId, ')
          ..write('payload: $payload, ')
          ..write('queuedAt: $queuedAt, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('failed: $failed, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CachedEntitiesTable cachedEntities = $CachedEntitiesTable(this);
  late final $AttendanceQueueItemsTable attendanceQueueItems =
      $AttendanceQueueItemsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [cachedEntities, attendanceQueueItems];
}

typedef $$CachedEntitiesTableCreateCompanionBuilder = CachedEntitiesCompanion
    Function({
  required String entity,
  required String id,
  required String teacherId,
  required String payload,
  required DateTime cachedAt,
  Value<int> rowid,
});
typedef $$CachedEntitiesTableUpdateCompanionBuilder = CachedEntitiesCompanion
    Function({
  Value<String> entity,
  Value<String> id,
  Value<String> teacherId,
  Value<String> payload,
  Value<DateTime> cachedAt,
  Value<int> rowid,
});

class $$CachedEntitiesTableFilterComposer
    extends Composer<_$AppDatabase, $CachedEntitiesTable> {
  $$CachedEntitiesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get entity => $composableBuilder(
      column: $table.entity, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get teacherId => $composableBuilder(
      column: $table.teacherId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payload => $composableBuilder(
      column: $table.payload, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnFilters(column));
}

class $$CachedEntitiesTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedEntitiesTable> {
  $$CachedEntitiesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get entity => $composableBuilder(
      column: $table.entity, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get teacherId => $composableBuilder(
      column: $table.teacherId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payload => $composableBuilder(
      column: $table.payload, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get cachedAt => $composableBuilder(
      column: $table.cachedAt, builder: (column) => ColumnOrderings(column));
}

class $$CachedEntitiesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedEntitiesTable> {
  $$CachedEntitiesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get entity =>
      $composableBuilder(column: $table.entity, builder: (column) => column);

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get teacherId =>
      $composableBuilder(column: $table.teacherId, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);

  GeneratedColumn<DateTime> get cachedAt =>
      $composableBuilder(column: $table.cachedAt, builder: (column) => column);
}

class $$CachedEntitiesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CachedEntitiesTable,
    CachedEntity,
    $$CachedEntitiesTableFilterComposer,
    $$CachedEntitiesTableOrderingComposer,
    $$CachedEntitiesTableAnnotationComposer,
    $$CachedEntitiesTableCreateCompanionBuilder,
    $$CachedEntitiesTableUpdateCompanionBuilder,
    (
      CachedEntity,
      BaseReferences<_$AppDatabase, $CachedEntitiesTable, CachedEntity>
    ),
    CachedEntity,
    PrefetchHooks Function()> {
  $$CachedEntitiesTableTableManager(
      _$AppDatabase db, $CachedEntitiesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedEntitiesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedEntitiesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedEntitiesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> entity = const Value.absent(),
            Value<String> id = const Value.absent(),
            Value<String> teacherId = const Value.absent(),
            Value<String> payload = const Value.absent(),
            Value<DateTime> cachedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedEntitiesCompanion(
            entity: entity,
            id: id,
            teacherId: teacherId,
            payload: payload,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String entity,
            required String id,
            required String teacherId,
            required String payload,
            required DateTime cachedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CachedEntitiesCompanion.insert(
            entity: entity,
            id: id,
            teacherId: teacherId,
            payload: payload,
            cachedAt: cachedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable<$CachedEntitiesTable, CachedEntity>(table),
                    BaseReferences<_$AppDatabase, $CachedEntitiesTable,
                        CachedEntity>(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CachedEntitiesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CachedEntitiesTable,
    CachedEntity,
    $$CachedEntitiesTableFilterComposer,
    $$CachedEntitiesTableOrderingComposer,
    $$CachedEntitiesTableAnnotationComposer,
    $$CachedEntitiesTableCreateCompanionBuilder,
    $$CachedEntitiesTableUpdateCompanionBuilder,
    (
      CachedEntity,
      BaseReferences<_$AppDatabase, $CachedEntitiesTable, CachedEntity>
    ),
    CachedEntity,
    PrefetchHooks Function()>;
typedef $$AttendanceQueueItemsTableCreateCompanionBuilder
    = AttendanceQueueItemsCompanion Function({
  required String key,
  required String teacherId,
  required String sessionId,
  required String studentId,
  required String payload,
  required DateTime queuedAt,
  Value<int> attempts,
  Value<String?> lastError,
  Value<bool> failed,
  Value<int> rowid,
});
typedef $$AttendanceQueueItemsTableUpdateCompanionBuilder
    = AttendanceQueueItemsCompanion Function({
  Value<String> key,
  Value<String> teacherId,
  Value<String> sessionId,
  Value<String> studentId,
  Value<String> payload,
  Value<DateTime> queuedAt,
  Value<int> attempts,
  Value<String?> lastError,
  Value<bool> failed,
  Value<int> rowid,
});

class $$AttendanceQueueItemsTableFilterComposer
    extends Composer<_$AppDatabase, $AttendanceQueueItemsTable> {
  $$AttendanceQueueItemsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get teacherId => $composableBuilder(
      column: $table.teacherId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sessionId => $composableBuilder(
      column: $table.sessionId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get studentId => $composableBuilder(
      column: $table.studentId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payload => $composableBuilder(
      column: $table.payload, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get queuedAt => $composableBuilder(
      column: $table.queuedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastError => $composableBuilder(
      column: $table.lastError, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get failed => $composableBuilder(
      column: $table.failed, builder: (column) => ColumnFilters(column));
}

class $$AttendanceQueueItemsTableOrderingComposer
    extends Composer<_$AppDatabase, $AttendanceQueueItemsTable> {
  $$AttendanceQueueItemsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get teacherId => $composableBuilder(
      column: $table.teacherId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sessionId => $composableBuilder(
      column: $table.sessionId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get studentId => $composableBuilder(
      column: $table.studentId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payload => $composableBuilder(
      column: $table.payload, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get queuedAt => $composableBuilder(
      column: $table.queuedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastError => $composableBuilder(
      column: $table.lastError, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get failed => $composableBuilder(
      column: $table.failed, builder: (column) => ColumnOrderings(column));
}

class $$AttendanceQueueItemsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AttendanceQueueItemsTable> {
  $$AttendanceQueueItemsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get teacherId =>
      $composableBuilder(column: $table.teacherId, builder: (column) => column);

  GeneratedColumn<String> get sessionId =>
      $composableBuilder(column: $table.sessionId, builder: (column) => column);

  GeneratedColumn<String> get studentId =>
      $composableBuilder(column: $table.studentId, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);

  GeneratedColumn<DateTime> get queuedAt =>
      $composableBuilder(column: $table.queuedAt, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<bool> get failed =>
      $composableBuilder(column: $table.failed, builder: (column) => column);
}

class $$AttendanceQueueItemsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AttendanceQueueItemsTable,
    AttendanceQueueItem,
    $$AttendanceQueueItemsTableFilterComposer,
    $$AttendanceQueueItemsTableOrderingComposer,
    $$AttendanceQueueItemsTableAnnotationComposer,
    $$AttendanceQueueItemsTableCreateCompanionBuilder,
    $$AttendanceQueueItemsTableUpdateCompanionBuilder,
    (
      AttendanceQueueItem,
      BaseReferences<_$AppDatabase, $AttendanceQueueItemsTable,
          AttendanceQueueItem>
    ),
    AttendanceQueueItem,
    PrefetchHooks Function()> {
  $$AttendanceQueueItemsTableTableManager(
      _$AppDatabase db, $AttendanceQueueItemsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttendanceQueueItemsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttendanceQueueItemsTableOrderingComposer(
                  $db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttendanceQueueItemsTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> teacherId = const Value.absent(),
            Value<String> sessionId = const Value.absent(),
            Value<String> studentId = const Value.absent(),
            Value<String> payload = const Value.absent(),
            Value<DateTime> queuedAt = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<bool> failed = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AttendanceQueueItemsCompanion(
            key: key,
            teacherId: teacherId,
            sessionId: sessionId,
            studentId: studentId,
            payload: payload,
            queuedAt: queuedAt,
            attempts: attempts,
            lastError: lastError,
            failed: failed,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String key,
            required String teacherId,
            required String sessionId,
            required String studentId,
            required String payload,
            required DateTime queuedAt,
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<bool> failed = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AttendanceQueueItemsCompanion.insert(
            key: key,
            teacherId: teacherId,
            sessionId: sessionId,
            studentId: studentId,
            payload: payload,
            queuedAt: queuedAt,
            attempts: attempts,
            lastError: lastError,
            failed: failed,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable<$AttendanceQueueItemsTable,
                        AttendanceQueueItem>(table),
                    BaseReferences<_$AppDatabase, $AttendanceQueueItemsTable,
                        AttendanceQueueItem>(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$AttendanceQueueItemsTableProcessedTableManager
    = ProcessedTableManager<
        _$AppDatabase,
        $AttendanceQueueItemsTable,
        AttendanceQueueItem,
        $$AttendanceQueueItemsTableFilterComposer,
        $$AttendanceQueueItemsTableOrderingComposer,
        $$AttendanceQueueItemsTableAnnotationComposer,
        $$AttendanceQueueItemsTableCreateCompanionBuilder,
        $$AttendanceQueueItemsTableUpdateCompanionBuilder,
        (
          AttendanceQueueItem,
          BaseReferences<_$AppDatabase, $AttendanceQueueItemsTable,
              AttendanceQueueItem>
        ),
        AttendanceQueueItem,
        PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CachedEntitiesTableTableManager get cachedEntities =>
      $$CachedEntitiesTableTableManager(_db, _db.cachedEntities);
  $$AttendanceQueueItemsTableTableManager get attendanceQueueItems =>
      $$AttendanceQueueItemsTableTableManager(_db, _db.attendanceQueueItems);
}
