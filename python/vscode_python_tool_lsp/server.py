# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""LSPToolServer: Parameterized LSP server framework for Python tools."""

from __future__ import annotations

import copy
import json
import logging
import os
import pathlib
import sys
import sysconfig
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Union

from lsprotocol import types as lsp
from pygls import uris
from pygls.lsp.server import LanguageServer
from pygls.workspace import TextDocument

from vscode_python_tool_lsp import jsonrpc
from vscode_python_tool_lsp.execution import (
    RunResult,
    is_current_interpreter,
    run_module,
    run_path,
)
from vscode_python_tool_lsp.paths import is_stdlib_file

MAX_WORKERS = 5


@dataclass
class ToolServerConfig:
    """Configuration for a parameterized LSP tool server."""

    # --- Identity ---
    tool_module: str
    tool_display: str
    min_version: str = ""

    # --- Capabilities ---
    is_formatter: bool = False
    supports_notebook: bool = True
    supports_code_actions: bool = False
    default_args: List[str] = field(default_factory=list)

    # --- Execution ---
    use_stdin: bool = True
    stdin_args: Optional[Callable[[str], List[str]]] = None

    # --- Output Processing ---
    parse_output: Optional[Callable[[str, str, dict], Union[List[lsp.Diagnostic], List[lsp.TextEdit]]]] = None

    # --- Optional Hooks ---
    validate_file: Optional[Callable[[str, dict], bool]] = None
    get_extra_args: Optional[Callable[[dict, str], List[str]]] = None
    on_initialize: Optional[Callable[[Any], None]] = None
    on_shutdown: Optional[Callable[[], None]] = None
    code_actions_handler: Optional[Callable] = None
    code_action_resolve_handler: Optional[Callable] = None

    # --- Settings ---
    extra_global_defaults: Dict[str, Any] = field(default_factory=dict)


class LSPToolServer:
    """Parameterized LSP server for Python tools (linters & formatters)."""

    def __init__(self, config: ToolServerConfig):
        self.config = config
        self._workspace_settings: Dict[str, dict] = {}
        self._global_settings: dict = {}
        self._runner = pathlib.Path(__file__).parent / "runner.py"

        notebook_sync = None
        if config.supports_notebook:
            notebook_sync = lsp.NotebookDocumentSyncOptions(
                notebook_selector=[
                    lsp.NotebookDocumentSyncOptionsNotebookSelectorType(
                        notebook=lsp.NotebookDocumentFilter(
                            notebook_type="jupyter-notebook"
                        ),
                        cells=[
                            lsp.NotebookDocumentSyncOptionsNotebookSelectorTypeCellsType(
                                language="python"
                            )
                        ],
                    ),
                    lsp.NotebookDocumentSyncOptionsNotebookSelectorType(
                        notebook=lsp.NotebookDocumentFilter(
                            notebook_type="interactive"
                        ),
                        cells=[
                            lsp.NotebookDocumentSyncOptionsNotebookSelectorTypeCellsType(
                                language="python"
                            )
                        ],
                    ),
                ]
            )

        self.server = LanguageServer(
            name=f"{config.tool_module}-server",
            version="v0.1.0",
            max_workers=MAX_WORKERS,
            notebook_document_sync=notebook_sync,
        )
        self._register_handlers()

    # =========================================================================
    # HANDLER REGISTRATION
    # =========================================================================

    def _register_handlers(self):
        """Register all LSP handlers based on config."""
        self.server.feature(lsp.INITIALIZE)(self._on_initialize)
        self.server.feature(lsp.EXIT)(self._on_exit)
        self.server.feature(lsp.SHUTDOWN)(self._on_shutdown)

        if self.config.is_formatter:
            self.server.feature(lsp.TEXT_DOCUMENT_FORMATTING)(self._on_formatting)
        else:
            self.server.feature(lsp.TEXT_DOCUMENT_DID_OPEN)(self._on_did_open)
            self.server.feature(lsp.TEXT_DOCUMENT_DID_SAVE)(self._on_did_save)
            self.server.feature(lsp.TEXT_DOCUMENT_DID_CLOSE)(self._on_did_close)

        if self.config.supports_code_actions and self.config.code_actions_handler:
            self.server.feature(lsp.TEXT_DOCUMENT_CODE_ACTION)(self.config.code_actions_handler)
        if self.config.supports_code_actions and self.config.code_action_resolve_handler:
            self.server.feature(lsp.CODE_ACTION_RESOLVE)(self.config.code_action_resolve_handler)

    # =========================================================================
    # LIFECYCLE
    # =========================================================================

    def _on_initialize(self, params: lsp.InitializeParams) -> None:
        """Handle initialization: load settings, log info."""
        self.log_to_output(
            f"CWD Server: {os.getcwd()}", lsp.MessageType.Info
        )
        paths = "\r\n  ".join(sys.path)
        self.log_to_output(f"sys.path used to run Server:\r\n  {paths}", lsp.MessageType.Info)

        settings = params.initialization_options
        if isinstance(settings, dict):
            self._global_settings = settings.get("globalSettings", {})
            self._update_workspace_settings(settings.get("settings", []))

        if self.config.on_initialize:
            self.config.on_initialize(params)

    def _on_shutdown(self, *args, **kwargs):
        """Handle shutdown."""
        if self.config.on_shutdown:
            self.config.on_shutdown()
        jsonrpc.shutdown_json_rpc()

    def _on_exit(self, *args, **kwargs):
        """Handle exit."""
        if self.config.on_shutdown:
            self.config.on_shutdown()
        jsonrpc.shutdown_json_rpc()

    # =========================================================================
    # TEXT DOCUMENT HANDLERS (Linting)
    # =========================================================================

    def _on_did_open(self, params: lsp.DidOpenTextDocumentParams) -> None:
        """Lint on open."""
        document = self.server.workspace.get_text_document(params.text_document.uri)
        diagnostics = self._lint_document(document)
        self.server.publish_diagnostics(document.uri, diagnostics)

    def _on_did_save(self, params: lsp.DidSaveTextDocumentParams) -> None:
        """Lint on save."""
        document = self.server.workspace.get_text_document(params.text_document.uri)
        diagnostics = self._lint_document(document)
        self.server.publish_diagnostics(document.uri, diagnostics)

    def _on_did_close(self, params: lsp.DidCloseTextDocumentParams) -> None:
        """Clear diagnostics on close."""
        self.server.publish_diagnostics(params.text_document.uri, [])

    # =========================================================================
    # TEXT DOCUMENT HANDLERS (Formatting)
    # =========================================================================

    def _on_formatting(self, params: lsp.DocumentFormattingParams):
        """Format document."""
        document = self.server.workspace.get_text_document(params.text_document.uri)
        return self._format_document(document)

    # =========================================================================
    # CORE EXECUTION
    # =========================================================================

    def _lint_document(self, document: TextDocument) -> List[lsp.Diagnostic]:
        """Run linter on document and return diagnostics."""
        result = self._run_tool(document)
        if result is None:
            return []

        settings = self._get_settings_by_document(document)
        if self.config.parse_output:
            output = self.config.parse_output(result.stdout, result.stderr, settings)
            return output if isinstance(output, list) else []
        return []

    def _format_document(self, document: TextDocument) -> Optional[List[lsp.TextEdit]]:
        """Run formatter on document and return text edits."""
        result = self._run_tool(document)
        if result is None:
            return None

        settings = self._get_settings_by_document(document)
        if self.config.parse_output:
            return self.config.parse_output(result.stdout, result.stderr, settings)
        return None

    def _run_tool(self, document: TextDocument) -> Optional[RunResult]:
        """Universal tool execution — 3 modes: path / rpc / module."""
        settings = self._get_settings_by_document(document)
        code_workspace = settings.get("workspaceFS", "")
        document_path = self._get_document_path(document)

        # Validate file
        if self.config.validate_file and not self.config.validate_file(
            document_path, settings
        ):
            return None

        # Build args
        argv: List[str] = list(settings.get("args", []))
        if self.config.get_extra_args:
            argv += self.config.get_extra_args(settings, document_path)

        if self.config.use_stdin and self.config.stdin_args:
            argv += self.config.stdin_args(document_path)
        elif not self.config.use_stdin:
            argv.append(document_path)

        cwd = self._get_cwd(settings, document)

        # Execute
        if settings.get("path"):
            self.log_to_output(
                f"Running tool with path: {settings['path']}",
                lsp.MessageType.Info,
            )
            return run_path(
                settings["path"] + argv,
                self.config.use_stdin,
                cwd,
                document.source if self.config.use_stdin else None,
            )

        interpreter = settings.get("interpreter", [sys.executable])
        if isinstance(interpreter, list) and len(interpreter) > 0:
            interpreter_path = interpreter[0]
        else:
            interpreter_path = sys.executable

        if not is_current_interpreter(interpreter_path):
            self.log_to_output(
                f"Running tool over JSON-RPC: {interpreter_path}",
                lsp.MessageType.Info,
            )
            result = jsonrpc.run_over_json_rpc(
                workspace=code_workspace,
                interpreter=interpreter,
                module=self.config.tool_module,
                argv=argv,
                use_stdin=self.config.use_stdin,
                cwd=cwd,
                source=document.source if self.config.use_stdin else None,
            )
            if result.exception:
                self.log_to_output(result.exception, lsp.MessageType.Error)
                return None
            return RunResult(result.stdout, result.stderr)

        self.log_to_output(
            f"Running tool as module: {self.config.tool_module}",
            lsp.MessageType.Info,
        )
        return run_module(
            self.config.tool_module,
            [self.config.tool_module] + argv,
            self.config.use_stdin,
            cwd,
            document.source if self.config.use_stdin else None,
        )

    # =========================================================================
    # SETTINGS
    # =========================================================================

    def _get_global_defaults(self) -> dict:
        defaults = {
            "path": [],
            "interpreter": [sys.executable],
            "args": self.config.default_args.copy(),
            "importStrategy": "useBundled",
            "showNotifications": "off",
            "cwd": "",
        }
        defaults.update(self.config.extra_global_defaults)
        return defaults

    def _update_workspace_settings(self, settings: list) -> None:
        for setting in settings:
            key = setting.get("workspace", "")
            uri = uris.from_fs_path(key) if key.startswith("/") or (len(key) > 1 and key[1] == ":") else key
            self._workspace_settings[uri] = {
                **self._get_global_defaults(),
                **setting,
                "workspaceFS": key,
            }

    def _get_settings_by_document(self, document: TextDocument) -> dict:
        """Get the workspace settings for the given document."""
        document_uri = document.uri
        workspace_uri = ""
        for uri in self._workspace_settings:
            if document_uri.startswith(uri):
                if len(uri) > len(workspace_uri):
                    workspace_uri = uri

        if workspace_uri:
            return self._workspace_settings[workspace_uri]

        settings = {
            **self._get_global_defaults(),
            **self._global_settings,
            "workspaceFS": "",
        }
        return settings

    # =========================================================================
    # CWD RESOLUTION
    # =========================================================================

    def _get_cwd(self, settings: dict, document: Optional[TextDocument] = None) -> str:
        cwd = settings.get("cwd", settings.get("workspaceFS", ""))
        workspace_fs = settings.get("workspaceFS", "")

        if document and hasattr(document, "path") and document.path:
            file_path = document.path
            substitutions = {
                "${file}": file_path,
                "${fileBasename}": os.path.basename(file_path),
                "${fileDirname}": os.path.dirname(file_path),
                "${fileExtname}": os.path.splitext(file_path)[1],
                "${fileBasenameNoExtension}": os.path.splitext(os.path.basename(file_path))[0],
            }
            if workspace_fs:
                rel = os.path.relpath(file_path, workspace_fs)
                substitutions["${relativeFile}"] = rel
                substitutions["${relativeFileDirname}"] = os.path.dirname(rel)

            for token, value in substitutions.items():
                cwd = cwd.replace(token, value)
        else:
            if "${file" in cwd or "${relativeFile" in cwd:
                cwd = workspace_fs

        return cwd if cwd else workspace_fs

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _get_document_path(self, document: TextDocument) -> str:
        """Returns the filesystem path for a document."""
        if hasattr(document, "path") and document.path:
            return document.path
        parsed = uris.urlparse(document.uri)
        return uris.to_fs_path(document.uri) if parsed.scheme == "file" else document.uri

    def log_to_output(self, message: str, msg_type: lsp.MessageType = lsp.MessageType.Log) -> None:
        """Log a message to the client output."""
        self.server.show_message_log(message, msg_type)

    def log_error(self, message: str) -> None:
        self.log_to_output(message, lsp.MessageType.Error)

    def log_warning(self, message: str) -> None:
        self.log_to_output(message, lsp.MessageType.Warning)

    def log_always(self, message: str) -> None:
        self.log_to_output(message, lsp.MessageType.Info)

    # =========================================================================
    # ENTRY POINT
    # =========================================================================

    def start(self):
        """Start the LSP server."""
        self.server.start_io()
