# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""Base LSP test session for Python tool extension testing.

Provides a reusable test client that implements the standard LSP protocol
methods. Extensions can subclass this to add tool-specific handlers.
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional

from vscode_python_tool_lsp.testing import constants
from vscode_python_tool_lsp.testing.defaults import vscode_initialize_defaults


class BaseLSPSession:
    """Base class for LSP test clients.

    Manages a subprocess running the LSP server and provides methods
    for all standard LSP protocol interactions. Subclass to add
    tool-specific request/notification handlers.
    """

    def __init__(
        self,
        cwd: Optional[str] = None,
        script: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ):
        self._cwd = cwd
        self._script = script
        self._env = env or {}
        self._process: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._diagnostics: Dict[str, List[Any]] = {}
        self._notification_callbacks: Dict[str, Callable] = {}
        self._executor = ThreadPoolExecutor(max_workers=2)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        return False

    def start(self) -> None:
        """Start the LSP server subprocess."""
        if not self._script:
            raise ValueError("Server script path is required")

        env = {**os.environ, **self._env}
        self._process = subprocess.Popen(
            [sys.executable, self._script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self._cwd,
            env=env,
        )

    def stop(self) -> None:
        """Stop the LSP server subprocess."""
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            finally:
                self._process = None
        self._executor.shutdown(wait=False)

    # =========================================================================
    # LSP LIFECYCLE
    # =========================================================================

    def initialize(
        self,
        initialize_params: Optional[Dict] = None,
        process_server_capabilities: Optional[Callable] = None,
    ) -> Dict:
        """Send initialize request."""
        params = initialize_params or vscode_initialize_defaults()
        return self._send_request(constants.INITIALIZE, params)

    def initialized(self, initialized_params: Optional[Dict] = None) -> None:
        """Send initialized notification."""
        self._send_notification(constants.INITIALIZED, initialized_params or {})

    def shutdown(self) -> Optional[Dict]:
        """Send shutdown request."""
        return self._send_request(constants.SHUTDOWN, None)

    def exit_lsp(self) -> None:
        """Send exit notification."""
        self._send_notification(constants.EXIT, None)

    # =========================================================================
    # TEXT DOCUMENT NOTIFICATIONS
    # =========================================================================

    def notify_did_open(self, did_open_params: Dict) -> None:
        """Send textDocument/didOpen notification."""
        self._send_notification(constants.TEXT_DOCUMENT_DID_OPEN, did_open_params)

    def notify_did_change(self, did_change_params: Dict) -> None:
        """Send textDocument/didChange notification."""
        self._send_notification(constants.TEXT_DOCUMENT_DID_CHANGE, did_change_params)

    def notify_did_save(self, did_save_params: Dict) -> None:
        """Send textDocument/didSave notification."""
        self._send_notification(constants.TEXT_DOCUMENT_DID_SAVE, did_save_params)

    def notify_did_close(self, did_close_params: Dict) -> None:
        """Send textDocument/didClose notification."""
        self._send_notification(constants.TEXT_DOCUMENT_DID_CLOSE, did_close_params)

    # =========================================================================
    # NOTEBOOK DOCUMENT NOTIFICATIONS
    # =========================================================================

    def notify_notebook_did_open(self, params: Dict) -> None:
        """Send notebookDocument/didOpen notification."""
        self._send_notification(constants.NOTEBOOK_DOCUMENT_DID_OPEN, params)

    def notify_notebook_did_change(self, params: Dict) -> None:
        """Send notebookDocument/didChange notification."""
        self._send_notification(constants.NOTEBOOK_DOCUMENT_DID_CHANGE, params)

    def notify_notebook_did_save(self, params: Dict) -> None:
        """Send notebookDocument/didSave notification."""
        self._send_notification(constants.NOTEBOOK_DOCUMENT_DID_SAVE, params)

    def notify_notebook_did_close(self, params: Dict) -> None:
        """Send notebookDocument/didClose notification."""
        self._send_notification(constants.NOTEBOOK_DOCUMENT_DID_CLOSE, params)

    # =========================================================================
    # REQUESTS
    # =========================================================================

    def text_document_formatting(self, formatting_params: Dict) -> Any:
        """Send textDocument/formatting request."""
        return self._send_request(constants.TEXT_DOCUMENT_FORMATTING, formatting_params)

    def text_document_code_action(self, code_action_params: Dict) -> List:
        """Send textDocument/codeAction request."""
        return self._send_request(constants.TEXT_DOCUMENT_CODE_ACTION, code_action_params)

    def code_action_resolve(self, code_action_resolve_params: Dict) -> Dict:
        """Send codeAction/resolve request."""
        return self._send_request(constants.CODE_ACTION_RESOLVE, code_action_resolve_params)

    # =========================================================================
    # NOTIFICATION MANAGEMENT
    # =========================================================================

    def set_notification_callback(self, notification_name: str, callback: Callable) -> None:
        """Register a callback for a specific notification type."""
        self._notification_callbacks[notification_name] = callback

    def get_notification_callback(self, notification_name: str) -> Optional[Callable]:
        """Get the callback for a specific notification type."""
        return self._notification_callbacks.get(notification_name)

    # =========================================================================
    # INTERNAL (Override in subclasses for custom protocol handling)
    # =========================================================================

    def _send_request(self, method: str, params: Any) -> Any:
        """Send a JSON-RPC request. Override for actual transport."""
        raise NotImplementedError(
            "Subclasses must implement _send_request with actual transport logic. "
            "See the extension's lsp_test_client for a complete implementation."
        )

    def _send_notification(self, method: str, params: Any) -> None:
        """Send a JSON-RPC notification. Override for actual transport."""
        raise NotImplementedError(
            "Subclasses must implement _send_notification with actual transport logic. "
            "See the extension's lsp_test_client for a complete implementation."
        )
