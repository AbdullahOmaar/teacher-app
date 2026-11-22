#!/usr/bin/env python3
"""
مولّد أنواع قاعدة البيانات (COD-1 — دفعة #10، 3A-373).

يقرأ المخطط الحي من Supabase Management API عبر مساعد الموصل
(custom.supabase/bin/supabase_api.py) ويكتب src/types/database.generated.ts
بصيغة `supabase gen types typescript` القياسية (Database/Tables/Views/
Functions/Enums + مساعدات Tables/TablesInsert/TablesUpdate/Enums).

لا يُحرَّر الملف المولّد يدوياً أبداً — أي تصحيح يكون هنا ثم إعادة توليد.

الاستخدام:
    python3 scripts/gen_db_types.py [--ref qkwdyqocazwhojpyifbv]
                                    [--out src/types/database.generated.ts]
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict

HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)

QUERIES = {
    "columns": """
select c.relname as table_name, c.relkind, a.attname as column_name,
       a.attnum, a.attnotnull, a.attidentity, a.attgenerated,
       pg_get_expr(d.adbin, d.adrelid) as default_expr,
       format_type(a.atttypid, a.atttypmod) as formatted_type,
       t.typname as base_type, t.typtype
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_type t on t.oid = a.atttypid
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r','v','m')
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum
""",
    "enums": """
select t.typname as enum_name, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by t.typname, e.enumsortorder
""",
    "fks": """
select src.relname as table_name, con.conname as fk_name,
       att.attname as column_name, tgt.relname as referenced_table,
       tatt.attname as referenced_column, k.ord
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute att on att.attrelid = src.oid and att.attnum = k.attnum
join lateral unnest(con.confkey) with ordinality as fk(attnum, ord)
  on fk.ord = k.ord
join pg_attribute tatt on tatt.attrelid = tgt.oid and tatt.attnum = fk.attnum
where con.contype = 'f'
order by con.conname, k.ord
""",
    "uniques": """
select rel.relname as table_name, con.conname, con.contype,
       (select array_agg(att.attname order by k.ord)
        from unnest(con.conkey) with ordinality as k(attnum, ord)
        join pg_attribute att on att.attrelid = rel.oid
          and att.attnum = k.attnum) as columns
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype in ('p','u')
order by rel.relname, con.conname
""",
    "functions": """
select p.proname as name, pg_get_function_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result, p.proretset, p.prokind
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname
""",
}

SCALARS = {
    "uuid": "string",
    "text": "string",
    "character varying": "string",
    "character": "string",
    "citext": "string",
    "date": "string",
    "time without time zone": "string",
    "time with time zone": "string",
    "timestamp without time zone": "string",
    "timestamp with time zone": "string",
    "smallint": "number",
    "integer": "number",
    "bigint": "number",
    "numeric": "number",
    "real": "number",
    "double precision": "number",
    "boolean": "boolean",
    "jsonb": "Json",
    "json": "Json",
    "bytea": "string",
    "interval": "string",
    "void": "undefined",
}


def run_query(ref: str, sql: str):
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", ref, sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def map_type(formatted: str, base_type: str, typtype: str, enum_names: set) -> str:
    """Postgres formatted type → TypeScript type (CLI mapping)."""
    if formatted.endswith("[]"):
        elem = formatted[:-2]
        return map_type(elem, elem, "b", enum_names) + "[]"
    if typtype == "e" or base_type in enum_names:
        return f'Database["public"]["Enums"]["{base_type}"]'
    if formatted in SCALARS:
        return SCALARS[formatted]
    if base_type in SCALARS:
        return SCALARS[base_type]
    raise ValueError(f"unmapped type: formatted={formatted!r} base={base_type!r}")


def split_top_level(s: str):
    parts, depth, quote, cur = [], 0, False, ""
    for ch in s:
        if quote:
            cur += ch
            if ch == "'":
                quote = False
            continue
        if ch == "'":
            quote = True
            cur += ch
        elif ch == "(":
            depth += 1
            cur += ch
        elif ch == ")":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def parse_args(args_str: str, enum_names: set):
    """pg_get_function_arguments → [(name, ts_type, has_default)]."""
    if not args_str.strip():
        return []
    parsed = []
    for part in split_top_level(args_str):
        has_default = False
        depth, quote, cut = 0, False, None
        upper = part.upper()
        for i in range(len(part) - 7):
            ch = part[i]
            if quote:
                if ch == "'":
                    quote = False
                continue
            if ch == "'":
                quote = True
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif depth == 0 and upper[i : i + 9] == " DEFAULT ":
                cut = i
                break
        if cut is not None:
            has_default = True
            part = part[:cut].strip()
        tokens = part.split(None, 1)
        if len(tokens) == 1:
            raise ValueError(f"unnamed function argument: {part!r}")
        name, ptype = tokens[0], tokens[1].strip()
        if name.upper() in ("IN", "OUT", "INOUT", "VARIADIC"):
            raise ValueError(f"arg mode prefix not handled: {part!r}")
        ts = map_type(ptype, ptype, "b", enum_names)
        parsed.append((name, ts, has_default))
    return parsed


def parse_returns(result: str, retset: bool, enum_names: set, table_names: set):
    result = result.strip()
    if result.startswith("TABLE(") and result.endswith(")"):
        inner = result[len("TABLE(") : -1]
        fields = []
        for part in split_top_level(inner):
            name, ptype = part.split(None, 1)
            fields.append(f"            {name}: {map_type(ptype.strip(), ptype.strip(), 'b', enum_names)}")
        obj = "{\n" + "\n".join(fields) + "\n          }"
        return obj + "[]" if retset else obj
    if result.startswith("SETOF "):
        inner = result[len("SETOF ") :].strip()
        if inner in table_names:
            return f'Database["public"]["Tables"]["{inner}"]["Row"][]'
        return map_type(inner, inner, "b", enum_names) + "[]"
    if result in table_names:
        row = f'Database["public"]["Tables"]["{result}"]["Row"]'
        return row + "[]" if retset else row
    ts = map_type(result, result, "b", enum_names)
    return ts + "[]" if retset else ts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="qkwdyqocazwhojpyifbv")
    ap.add_argument("--out", default="src/types/database.generated.ts")
    ap.add_argument("--date", default="")
    args = ap.parse_args()

    data = {k: run_query(args.ref, q) for k, q in QUERIES.items()}

    enum_names = set()
    enums = defaultdict(list)
    for e in data["enums"]:
        enum_names.add(e["enum_name"])
        enums[e["enum_name"]].append(e["enumlabel"])

    tables = {}
    for c in data["columns"]:
        tables.setdefault(c["table_name"], {"relkind": c["relkind"], "cols": []})
        tables[c["table_name"]]["cols"].append(c)
    table_names = {n for n, t in tables.items() if t["relkind"] == "r"}
    view_names = {n for n, t in tables.items() if t["relkind"] in ("v", "m")}

    unique_sets = defaultdict(list)
    for u in data["uniques"]:
        unique_sets[u["table_name"]].append(set(u["columns"] or []))

    rels = defaultdict(list)
    fk_groups = {}
    for fk in data["fks"]:
        key = (fk["table_name"], fk["fk_name"])
        g = fk_groups.setdefault(
            key,
            {
                "foreignKeyName": fk["fk_name"],
                "columns": [],
                "referencedRelation": fk["referenced_table"],
                "referencedColumns": [],
            },
        )
        g["columns"].append(fk["column_name"])
        g["referencedColumns"].append(fk["referenced_column"])
    for (tname, _), g in fk_groups.items():
        g["isOneToOne"] = set(g["columns"]) in unique_sets.get(tname, [])
        rels[tname].append(g)
    for tname in rels:
        rels[tname].sort(key=lambda g: g["foreignKeyName"])

    def col_ts(c):
        return map_type(c["formatted_type"], c["base_type"], c["typtype"], enum_names)

    def row_block(cols, indent):
        lines = []
        for c in cols:
            ts = col_ts(c)
            if not c["attnotnull"]:
                ts += " | null"
            lines.append(f"{indent}{c['column_name']}: {ts}")
        return lines

    def insert_block(cols, indent):
        lines = []
        for c in cols:
            optional = (
                not c["attnotnull"]
                or c["default_expr"] is not None
                or c["attidentity"] in ("a", "d")
                or c["attgenerated"] == "s"
            )
            ts = col_ts(c)
            if not c["attnotnull"]:
                ts += " | null"
            lines.append(f"{indent}{c['column_name']}{'?' if optional else ''}: {ts}")
        return lines

    def update_block(cols, indent):
        lines = []
        for c in cols:
            ts = col_ts(c)
            if not c["attnotnull"]:
                ts += " | null"
            lines.append(f"{indent}{c['column_name']}?: {ts}")
        return lines

    def rel_block(tname, indent):
        entries = rels.get(tname, [])
        if not entries:
            return [f"{indent}Relationships: []"]
        lines = [f"{indent}Relationships: ["]
        for g in entries:
            cols = ", ".join(f'"{c}"' for c in g["columns"])
            rcols = ", ".join(f'"{c}"' for c in g["referencedColumns"])
            lines.append(f"{indent}  {{")
            lines.append(f'{indent}    foreignKeyName: "{g["foreignKeyName"]}"')
            lines.append(f"{indent}    columns: [{cols}]")
            lines.append(f"{indent}    isOneToOne: {'true' if g['isOneToOne'] else 'false'}")
            lines.append(f'{indent}    referencedRelation: "{g["referencedRelation"]}"')
            lines.append(f"{indent}    referencedColumns: [{rcols}]")
            lines.append(f"{indent}  }},")
        lines.append(f"{indent}]")
        return lines

    out = []
    out.append("/**")
    out.append(" * أنواع قاعدة البيانات المولّدة من المخطط الحي — COD-1 (3A-373).")
    out.append(" *")
    out.append(" * GENERATED — do not edit by hand. Regenerate with:")
    out.append(" *   python3 scripts/gen_db_types.py")
    out.append(f" * Source: Supabase project {args.ref} (public schema), {args.date}.")
    out.append(" * Shape mirrors `supabase gen types typescript` output.")
    out.append(" */")
    out.append("")
    out.append("export type Json =")
    out.append("  | string")
    out.append("  | number")
    out.append("  | boolean")
    out.append("  | null")
    out.append("  | { [key: string]: Json | undefined }")
    out.append("  | Json[]")
    out.append("")
    out.append("export type Database = {")
    out.append("  public: {")
    out.append("    Tables: {")
    for name in sorted(table_names):
        cols = tables[name]["cols"]
        out.append(f"      {name}: {{")
        out.append("        Row: {")
        out += row_block(cols, "          ")
        out.append("        }")
        out.append("        Insert: {")
        out += insert_block(cols, "          ")
        out.append("        }")
        out.append("        Update: {")
        out += update_block(cols, "          ")
        out.append("        }")
        out += rel_block(name, "        ")
        out.append("      }")
    out.append("    }")
    out.append("    Views: {")
    for name in sorted(view_names):
        cols = tables[name]["cols"]
        out.append(f"      {name}: {{")
        out.append("        Row: {")
        out += row_block(cols, "          ")
        out.append("        }")
        out += rel_block(name, "        ")
        out.append("      }")
    out.append("    }")
    out.append("    Functions: {")
    fn_groups = defaultdict(list)
    for f in data["functions"]:
        if f["result"].strip() == "trigger":
            continue
        fn_groups[f["name"]].append(f)
    for name in sorted(fn_groups):
        overloads = fn_groups[name]
        blocks = []
        for f in overloads:
            fargs = parse_args(f["args"], enum_names)
            returns = parse_returns(f["result"], f["proretset"], enum_names, table_names)
            if not fargs:
                blocks.append("{\n          Args: Record<PropertyKey, never>\n"
                              f"          Returns: {returns}\n        }}")
            else:
                lines = ["{", "          Args: {"]
                for aname, ats, has_default in fargs:
                    lines.append(f"            {aname}{'?' if has_default else ''}: {ats}")
                lines.append("          }")
                lines.append(f"          Returns: {returns}")
                lines.append("        }")
                blocks.append("\n".join(lines))
        if len(blocks) == 1:
            out.append(f"      {name}: {blocks[0]}")
        else:
            out.append(f"      {name}:")
            for i, b in enumerate(blocks):
                suffix = " |" if i < len(blocks) - 1 else ""
                out.append(f"        {b}{suffix}")
    out.append("    }")
    out.append("    Enums: {")
    for name in sorted(enums):
        vals = " | ".join(f'"{v}"' for v in enums[name])
        out.append(f"      {name}: {vals}")
    out.append("    }")
    out.append("    CompositeTypes: {")
    out.append("      [_ in never]: never")
    out.append("    }")
    out.append("  }")
    out.append("}")
    out.append("")
    out.append('type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">')
    out.append("")
    out.append('type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]')
    out.append("")
    out.append("export type Tables<")
    out.append("  DefaultSchemaTableNameOrOptions extends")
    out.append('    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])')
    out.append("    | { schema: keyof DatabaseWithoutInternals },")
    out.append("  TableName extends DefaultSchemaTableNameOrOptions extends {")
    out.append("    schema: keyof DatabaseWithoutInternals")
    out.append("  }")
    out.append('    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &')
    out.append('        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])')
    out.append("    : never = never,")
    out.append("> = DefaultSchemaTableNameOrOptions extends {")
    out.append("  schema: keyof DatabaseWithoutInternals")
    out.append("}")
    out.append('  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &')
    out.append('      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {')
    out.append("      Row: infer R")
    out.append("    }")
    out.append("    ? R")
    out.append("    : never")
    out.append('  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &')
    out.append('        DefaultSchema["Views"])')
    out.append('    ? (DefaultSchema["Tables"] &')
    out.append('        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {')
    out.append("        Row: infer R")
    out.append("      }")
    out.append("      ? R")
    out.append("      : never")
    out.append("    : never")
    out.append("")
    out.append("export type TablesInsert<")
    out.append("  DefaultSchemaTableNameOrOptions extends")
    out.append('    | keyof DefaultSchema["Tables"]')
    out.append("    | { schema: keyof DatabaseWithoutInternals },")
    out.append("  TableName extends DefaultSchemaTableNameOrOptions extends {")
    out.append("    schema: keyof DatabaseWithoutInternals")
    out.append("  }")
    out.append('    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]')
    out.append("    : never = never,")
    out.append("> = DefaultSchemaTableNameOrOptions extends {")
    out.append("  schema: keyof DatabaseWithoutInternals")
    out.append("}")
    out.append('  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {')
    out.append("      Insert: infer I")
    out.append("    }")
    out.append("    ? I")
    out.append("    : never")
    out.append('  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]')
    out.append('    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {')
    out.append("        Insert: infer I")
    out.append("      }")
    out.append("      ? I")
    out.append("      : never")
    out.append("    : never")
    out.append("")
    out.append("export type TablesUpdate<")
    out.append("  DefaultSchemaTableNameOrOptions extends")
    out.append('    | keyof DefaultSchema["Tables"]')
    out.append("    | { schema: keyof DatabaseWithoutInternals },")
    out.append("  TableName extends DefaultSchemaTableNameOrOptions extends {")
    out.append("    schema: keyof DatabaseWithoutInternals")
    out.append("  }")
    out.append('    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]')
    out.append("    : never = never,")
    out.append("> = DefaultSchemaTableNameOrOptions extends {")
    out.append("  schema: keyof DatabaseWithoutInternals")
    out.append("}")
    out.append('  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {')
    out.append("      Update: infer U")
    out.append("    }")
    out.append("    ? U")
    out.append("    : never")
    out.append('  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]')
    out.append('    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {')
    out.append("        Update: infer U")
    out.append("      }")
    out.append("      ? U")
    out.append("      : never")
    out.append("    : never")
    out.append("")
    out.append("export type Enums<")
    out.append("  DefaultSchemaEnumNameOrOptions extends")
    out.append('    | keyof DefaultSchema["Enums"]')
    out.append("    | { schema: keyof DatabaseWithoutInternals },")
    out.append("  EnumName extends DefaultSchemaEnumNameOrOptions extends {")
    out.append("    schema: keyof DatabaseWithoutInternals")
    out.append("  }")
    out.append('    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]')
    out.append("    : never = never,")
    out.append("> = DefaultSchemaEnumNameOrOptions extends {")
    out.append("  schema: keyof DatabaseWithoutInternals")
    out.append("}")
    out.append('  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]')
    out.append('  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]')
    out.append('    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]')
    out.append("    : never")
    out.append("")
    out.append("export type CompositeTypes<")
    out.append("  PublicCompositeTypeNameOrOptions extends")
    out.append('    | keyof DefaultSchema["CompositeTypes"]')
    out.append("    | { schema: keyof DatabaseWithoutInternals },")
    out.append("  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {")
    out.append("    schema: keyof DatabaseWithoutInternals")
    out.append("  }")
    out.append('    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]')
    out.append("    : never = never,")
    out.append("> = PublicCompositeTypeNameOrOptions extends {")
    out.append("  schema: keyof DatabaseWithoutInternals")
    out.append("}")
    out.append('  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]')
    out.append('  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]')
    out.append('    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]')
    out.append("    : never")
    out.append("")

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    print(
        f"generated {args.out}: {len(table_names)} tables, "
        f"{len(view_names)} views, {sum(len(v) for v in fn_groups.values())} functions, "
        f"{len(enums)} enums"
    )


if __name__ == "__main__":
    main()
