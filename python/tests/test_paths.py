# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Tests for path utilities."""

from vscode_python_tool_lsp.paths import is_match, normalize_path


def test_is_match_basename():
    assert is_match(["*.py"], "/some/path/file.py")
    assert not is_match(["*.py"], "/some/path/file.txt")


def test_is_match_with_workspace():
    assert is_match(["tests/*.py"], "/workspace/tests/test_foo.py", "/workspace")


def test_normalize_path():
    path = normalize_path(".")
    assert len(path) > 0
