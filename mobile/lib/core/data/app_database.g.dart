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

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CachedEntitiesTable cachedEntities = $CachedEntitiesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [cachedEntities];
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

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CachedEntitiesTableTableManager get cachedEntities =>
      $$CachedEntitiesTableTableManager(_db, _db.cachedEntities);
}
