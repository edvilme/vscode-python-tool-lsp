# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Tests for execution utilities."""

from vscode_python_tool_lsp.execution import RunResult, CustomIO, as_list


def test_as_list_with_list():
    assert as_list([1, 2, 3]) == [1, 2, 3]


def test_as_list_with_tuple():
    assert as_list((1, 2)) == [1, 2]


def test_as_list_with_single():
    assert as_list(42) == [42]


def test_run_result():
    result = RunResult("output", "error")
    assert result.stdout == "output"
    assert result.stderr == "error"
    assert result.exit_code is None


def test_run_result_with_exit_code():
    result = RunResult("out", "err", 1)
    assert result.exit_code == 1


def test_custom_io():
    stream = CustomIO("<test>")
    stream.write("hello")
    value = stream.get_value()
    assert value == "hello"
