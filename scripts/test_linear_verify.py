#!/usr/bin/env python3
"""Unit tests for scripts/linear_verify.py (mocked Linear CLI — no live calls).

Run: python3 -m unittest discover -s scripts -p 'test_linear_verify.py'
"""
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import linear_verify


def _envelope(inner, is_error=False):
    return json.dumps({
        "ok": True,
        "result": {"content": [{"text": json.dumps(inner)}]},
        "isError": is_error,
    })


ISSUE_DONE = {
    "id": "3A-999", "title": "المهمة 99 — اختبار",
    "description": "«تقدير: 3 ساعة»\n\nوصف.",
    "status": "Done", "completedAt": "2026-11-24T19:00:00.000Z",
    "labels": ["Phase 2"],
}
COMMENTS_ONE = {"comments": [{"body": "إغلاق: «تقدير: 3 ساعة — فعلي: 1 ساعة»."}],
                "hasNextPage": False}


class FakeProc:
    def __init__(self, stdout, returncode=0):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = ""


def fake_run_factory(responses):
    """responses: list of (tool_name, inner_dict) in call order."""
    calls = {"i": 0}

    def fake_run(cmd, capture_output, text, timeout):
        name = json.loads(cmd[cmd.index("--arguments-json") + 1])
        tool = cmd[cmd.index("--name") + 1]
        idx = calls["i"]
        calls["i"] += 1
        expected_tool, inner = responses[idx]
        assert tool == expected_tool, f"call {idx}: got {tool}, want {expected_tool}"
        return FakeProc(_envelope(inner))

    return fake_run


class TestExtractEstimate(unittest.TestCase):
    def test_found(self):
        self.assertEqual(linear_verify.extract_estimate("«تقدير: 3 ساعة»"), 3.0)
        self.assertEqual(linear_verify.extract_estimate("x «تقدير: 2.5 ساعة» y"), 2.5)

    def test_missing(self):
        self.assertIsNone(linear_verify.extract_estimate("لا تقدير هنا"))
        self.assertIsNone(linear_verify.extract_estimate(None))


class TestVerify(unittest.TestCase):
    @mock.patch("linear_verify.subprocess.run")
    def test_all_pass(self, run):
        run.side_effect = fake_run_factory([
            ("get_issue", ISSUE_DONE),
            ("list_comments", COMMENTS_ONE),
        ])
        args = linear_verify.build_parser().parse_args([
            "verify", "3A-999", "--status", "Done", "--labels", "Phase 2",
            "--estimate", "--estimate-hours", "3",
            "--comment-contains", "فعلي:",
        ])
        self.assertEqual(linear_verify.cmd_verify(args), 0)

    @mock.patch("linear_verify.subprocess.run")
    def test_status_mismatch_fails(self, run):
        run.side_effect = fake_run_factory([
            ("get_issue", {**ISSUE_DONE, "status": "In Progress", "completedAt": None}),
            ("list_comments", COMMENTS_ONE),
        ])
        args = linear_verify.build_parser().parse_args(
            ["verify", "3A-999", "--status", "Done"])
        self.assertEqual(linear_verify.cmd_verify(args), 1)

    @mock.patch("linear_verify.subprocess.run")
    def test_missing_comment_fails(self, run):
        run.side_effect = fake_run_factory([
            ("get_issue", ISSUE_DONE),
            ("list_comments", {"comments": [], "hasNextPage": False}),
        ])
        args = linear_verify.build_parser().parse_args(
            ["verify", "3A-999", "--comment-contains", "فعلي:"])
        self.assertEqual(linear_verify.cmd_verify(args), 1)


class TestComment(unittest.TestCase):
    @mock.patch("linear_verify.subprocess.run")
    def test_post_then_verify(self, run):
        run.side_effect = fake_run_factory([
            ("save_comment", {"id": "abc-123"}),
            ("list_comments", {"comments": [{"body": "تقدم: البند 1."}],
                               "hasNextPage": False}),
        ])
        args = linear_verify.build_parser().parse_args(
            ["comment", "3A-999", "--body", "تقدم: البند 1."])
        self.assertEqual(linear_verify.cmd_comment(args), 0)


class TestSetStatus(unittest.TestCase):
    @mock.patch("linear_verify.subprocess.run")
    def test_update_uses_id_and_verifies(self, run):
        seen = {}

        def capturing(cmd, capture_output, text, timeout):
            args_json = json.loads(cmd[cmd.index("--arguments-json") + 1])
            tool = cmd[cmd.index("--name") + 1]
            seen.setdefault(tool, []).append(args_json)
            if tool == "save_issue":
                return FakeProc(_envelope({"ok": True}))
            return FakeProc(_envelope(ISSUE_DONE))

        run.side_effect = capturing
        args = linear_verify.build_parser().parse_args(
            ["set-status", "3A-999", "--state", "Done"])
        self.assertEqual(linear_verify.cmd_set_status(args), 0)
        # The trap: updates must use `id`, never `issueId`.
        self.assertEqual(seen["save_issue"][0], {"id": "3A-999", "state": "Done"})
        self.assertNotIn("issueId", seen["save_issue"][0])


class TestCallErrors(unittest.TestCase):
    @mock.patch("linear_verify.subprocess.run")
    def test_error_envelope_raises(self, run):
        run.return_value = FakeProc(_envelope(
            "Input validation error: bad key", is_error=True))
        with self.assertRaises(linear_verify.LinearError):
            linear_verify.get_issue("3A-999")


if __name__ == "__main__":
    unittest.main()
