# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
"""LSP method name constants for testing."""

EXIT = "exit"
INITIALIZE = "initialize"
INITIALIZED = "initialized"
SHUTDOWN = "shutdown"

TEXT_DOCUMENT_DID_OPEN = "textDocument/didOpen"
TEXT_DOCUMENT_DID_CHANGE = "textDocument/didChange"
TEXT_DOCUMENT_DID_SAVE = "textDocument/didSave"
TEXT_DOCUMENT_DID_CLOSE = "textDocument/didClose"
TEXT_DOCUMENT_FORMATTING = "textDocument/formatting"
TEXT_DOCUMENT_CODE_ACTION = "textDocument/codeAction"
TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS = "textDocument/publishDiagnostics"

CODE_ACTION_RESOLVE = "codeAction/resolve"

NOTEBOOK_DOCUMENT_DID_OPEN = "notebookDocument/didOpen"
NOTEBOOK_DOCUMENT_DID_CHANGE = "notebookDocument/didChange"
NOTEBOOK_DOCUMENT_DID_SAVE = "notebookDocument/didSave"
NOTEBOOK_DOCUMENT_DID_CLOSE = "notebookDocument/didClose"

WINDOW_LOG_MESSAGE = "window/logMessage"
WINDOW_SHOW_MESSAGE = "window/showMessage"
