#!/usr/bin/env python3
"""Linear write-then-verify tool — Phase 2 Task 4 (انضباط التحقق والتقدير).

قاعدة التحقق (ج14-1/ج15-2): لا تُبلَّغ أي كتابة في Linear على أنها تمّت
إلا بعد إعادة قراءتها حيًا ومقارنتها بالمتوقع. `ok:true` وحدها لا تثبت
شيئًا — فخّ `issueId` مقابل `id` (2026-11-24) علّمنا ذلك.

الأوامر:
  verify ISSUE [--status S] [--labels A,B] [--estimate] [--estimate-hours H]
               [--comment-contains TEXT] [--title-contains TEXT]
      يعيد قراءة البند (get_issue) وتعليقاته (list_comments)، ويفحص كل
      توقّع، ويطبع PASS/FAIL لكل فحص. خروج 0 = الكل ناجح، 1 = فشل.
  comment ISSUE --body TEXT [--expect-marker TEXT]
      ينشر التعليق (save_comment) ثم يعيد قراءة التعليقات ويتحقق من ظهوره.
  set-status ISSUE --state S
      يحدّث الحالة (save_issue بمفتاح `id`) ثم يعيد القراءة ويتحقق من
      الحالة (ومن completedAt عندما تكون Done).

ملاحظات:
- list_comments محدودة الصفحة الأولى (50 تعليقًا)؛ إن لم يُعثر على العلامة
  وكانت هناك صفحة تالية، يطبع INCONCLUSIVE ويخرج 1.
- لا أسرار تُطبع أبدًا؛ القيم تُمرَّر عبر الوسيطات فقط.
- الاستخدام: python3 scripts/linear_verify.py verify 3A-708 --status "In Progress" --labels "Phase 2" --estimate
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

LINEAR_CLI = os.environ.get("LINEAR_CLI", "/opt/hatch/bin/linear")


class LinearError(RuntimeError):
    pass


def _call(tool: str, args: dict) -> dict:
    """Call the Linear MCP CLI once and return the decoded inner JSON."""
    proc = subprocess.run(
        [LINEAR_CLI, "call-tool", "--name", tool,
         "--arguments-json", json.dumps(args)],
        capture_output=True, text=True, timeout=180,
    )
    if proc.returncode != 0:
        raise LinearError(
            f"{tool} exited {proc.returncode}: {proc.stdout[:300]} {proc.stderr[:300]}")
    try:
        envelope = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise LinearError(f"{tool}: unparsable envelope: {exc}") from exc
    if envelope.get("isError"):
        text = envelope["result"]["content"][0]["text"]
        raise LinearError(f"{tool}: {text[:500]}")
    inner = envelope["result"]["content"][0]["text"]
    try:
        return json.loads(inner)
    except json.JSONDecodeError as exc:
        raise LinearError(f"{tool}: unparsable result: {exc}") from exc


def get_issue(ident: str) -> dict:
    return _call("get_issue", {"id": ident})


def list_comments(ident: str) -> dict:
    return _call("list_comments", {"issueId": ident})


def save_comment(ident: str, body: str) -> dict:
    return _call("save_comment", {"issueId": ident, "body": body})


def set_status(ident: str, state: str) -> dict:
    # UPDATE takes `id` — never `issueId` (the ok:true trap, 2026-11-24).
    return _call("save_issue", {"id": ident, "state": state})


def extract_estimate(description: str | None) -> float | None:
    """Return the «تقدير: X ساعة» value from a description, or None."""
    match = re.search(r"«تقدير:\s*([\d.]+)\s*ساعة»", description or "")
    return float(match.group(1)) if match else None


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def cmd_verify(args: argparse.Namespace) -> int:
    issue = get_issue(args.issue)
    comments = list_comments(args.issue)
    bodies = [c.get("body", "") for c in comments.get("comments", [])]
    results = []

    if args.status is not None:
        results.append(check("status", issue.get("status") == args.status,
                             f"live={issue.get('status')!r} expected={args.status!r}"))
    if args.status == "Done":
        results.append(check("completedAt set", bool(issue.get("completedAt")),
                             f"completedAt={issue.get('completedAt')}"))
    if args.labels is not None:
        expected = [label.strip() for label in args.labels.split(",")]
        results.append(check("labels", issue.get("labels") == expected,
                             f"live={issue.get('labels')} expected={expected}"))
    if args.estimate:
        results.append(check("estimate present", extract_estimate(issue.get("description")) is not None,
                             f"description starts: {(issue.get('description') or '')[:60]!r}"))
    if args.estimate_hours is not None:
        live = extract_estimate(issue.get("description"))
        results.append(check("estimate value", live == args.estimate_hours,
                             f"live={live} expected={args.estimate_hours}"))
    if args.title_contains is not None:
        results.append(check("title contains", args.title_contains in (issue.get("title") or ""),
                             f"title={issue.get('title')!r}"))
    if args.comment_contains is not None:
        found = any(args.comment_contains in body for body in bodies)
        if not found and comments.get("hasNextPage"):
            print("  [INCONCLUSIVE] comment marker not in first page "
                  "(list is page-limited at 50)")
            results.append(False)
        else:
            results.append(check("comment present", found,
                                 f"searched {len(bodies)} comment(s) for {args.comment_contains!r}"))
    print(f"{args.issue}: {'ALL CHECKS PASSED' if all(results) else 'VERIFICATION FAILED'} "
          f"({sum(results)}/{len(results)})")
    return 0 if results and all(results) else 1


def cmd_comment(args: argparse.Namespace) -> int:
    marker = args.expect_marker or args.body
    created = save_comment(args.issue, args.body)
    print(f"comment posted: id={created.get('id')}")
    comments = list_comments(args.issue)
    bodies = [c.get("body", "") for c in comments.get("comments", [])]
    found = any(marker in body for body in bodies)
    if not found and comments.get("hasNextPage"):
        print("  [INCONCLUSIVE] marker not in first page (list is page-limited at 50)")
        return 1
    print(f"  [{'PASS' if found else 'FAIL'}] comment visible after re-read "
          f"({len(bodies)} comment(s) checked)")
    return 0 if found else 1


def cmd_set_status(args: argparse.Namespace) -> int:
    set_status(args.issue, args.state)
    issue = get_issue(args.issue)
    ok = check("status", issue.get("status") == args.state,
               f"live={issue.get('status')!r} expected={args.state!r}")
    if args.state == "Done":
        ok = check("completedAt set", bool(issue.get("completedAt")),
                   f"completedAt={issue.get('completedAt')}") and ok
    print(f"{args.issue}: {'STATUS VERIFIED' if ok else 'STATUS MISMATCH'}")
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("verify", help="re-read an issue and diff it against expectations")
    p.add_argument("issue")
    p.add_argument("--status")
    p.add_argument("--labels", help="comma-separated expected label names")
    p.add_argument("--estimate", action="store_true", help="«تقدير» must be present in the description")
    p.add_argument("--estimate-hours", type=float)
    p.add_argument("--comment-contains")
    p.add_argument("--title-contains")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("comment", help="post a comment, then verify it appears")
    p.add_argument("issue")
    p.add_argument("--body", required=True)
    p.add_argument("--expect-marker", help="substring to look for (defaults to the full body)")
    p.set_defaults(func=cmd_comment)

    p = sub.add_parser("set-status", help="set state, then verify by re-reading")
    p.add_argument("issue")
    p.add_argument("--state", required=True)
    p.set_defaults(func=cmd_set_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except LinearError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
