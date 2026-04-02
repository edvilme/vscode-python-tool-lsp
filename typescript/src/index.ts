// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * vscode-python-tool-lsp
 *
 * Shared TypeScript package for building VS Code Python tool extensions.
 * Provides activation lifecycle, settings management, server management,
 * Python environment detection, config file watching, logging, and status.
 */

// Core activation
export { activateToolExtension, deactivateToolExtension } from './activation';

// Types
export type { ToolConfig, IServerInfo, IInterpreterDetails } from './types';

// Settings
export type { ISettings } from './settings';
export {
    getExtensionSettings,
    getWorkspaceSettings,
    getGlobalSettings,
    checkIfConfigurationChanged,
    getTrackedSettings,
    resolveVariables,
} from './settings';

// Server
export type { IInitOptions } from './server';
export { restartServer } from './server';

// Config file watching
export { createConfigFileWatchers } from './configWatcher';

// Python environment
export {
    initializePython,
    onDidChangePythonInterpreter,
    getInterpreterDetails,
    resolveInterpreter,
    checkVersion,
    getDebuggerPath,
    runPythonExtensionCommand,
    resetCachedApis,
    setPythonVersionRequirement,
} from './python';

// Logging
export {
    registerLogger,
    traceLog,
    traceError,
    traceWarn,
    traceInfo,
    traceVerbose,
} from './logging';

// Status
export { registerLanguageStatusItem, updateStatus } from './status';

// Setup
export { loadServerDefaults, EXTENSION_ROOT_DIR, BUNDLED_PYTHON_SCRIPTS_DIR } from './setup';

// Utilities
export {
    getProjectRoot,
    getDocumentSelector,
    getLSClientTraceLevel,
    getInterpreterFromSetting,
} from './utilities';

// VS Code API wrappers
export {
    createOutputChannel,
    getConfiguration,
    registerCommand,
    onDidChangeConfiguration,
    isVirtualWorkspace,
    getWorkspaceFolders,
    getWorkspaceFolder,
    registerDocumentFormattingEditProvider,
    createLanguageStatusItem,
    getActiveTextEditor,
    onDidChangeActiveTextEditor,
    createStatusBarItem,
} from './vscodeapi';
