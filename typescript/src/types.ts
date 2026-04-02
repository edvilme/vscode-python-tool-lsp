// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable, ExtensionContext, LanguageStatusSeverity, LogOutputChannel, Uri, WorkspaceFolder } from 'vscode';
import { DocumentSelector, LanguageClient } from 'vscode-languageclient/node';
import { ISettings } from './settings';

/**
 * Configuration interface for Python tool extensions.
 *
 * Each extension provides a `ToolConfig` to the shared package,
 * parameterizing the extension behavior for their specific tool.
 */
export interface ToolConfig {
    // --- Identity ---

    /** Tool identifier used as settings namespace (e.g., "black-formatter", "pylint") */
    toolId: string;

    /** Display name for UI (e.g., "Black Formatter", "Pylint") */
    displayName: string;

    /** Full extension ID from package.json (e.g., "ms-python.black-formatter") */
    extensionId: string;

    /** Module name for internal routing (e.g., "black-formatter") */
    module: string;

    // --- Python Requirements ---

    /** Minimum Python version required */
    minimumPythonVersion: { major: number; minor: number };

    // --- Config File Watching ---

    /** Tool-specific config files to watch for changes (e.g., ["pyproject.toml", ".black"]) */
    configFiles: string[];

    // --- Settings ---

    /** Extra keys to monitor in checkIfConfigurationChanged beyond the base settings */
    configurationChangedKeys?: string[];

    /**
     * Override variable resolution for tool-specific substitutions.
     * Return modified value or undefined to use default resolution.
     */
    resolveVariablesOverride?: (
        value: string[],
        key: string,
        workspace?: WorkspaceFolder,
        interpreter?: string[],
        env?: NodeJS.ProcessEnv,
    ) => string[] | undefined;

    // --- Commands ---

    /** Additional commands to register beyond "restart" and "showLogs" */
    additionalCommands?: Array<{
        command: string;
        title: string;
        handler: (...args: unknown[]) => Promise<void>;
    }>;

    // --- Lifecycle Hooks ---

    hooks?: {
        /** Called after logging is initialized, before server startup */
        onActivate?: (context: ExtensionContext, outputChannel: LogOutputChannel) => Promise<void>;

        /** Called during deactivation */
        onDeactivate?: () => Promise<void>;

        /** Called before server restart. Return false to abort restart. */
        beforeServerRestart?: (
            settings: ISettings,
            serverId: string,
            outputChannel: LogOutputChannel,
        ) => Promise<boolean>;

        /** Called after server successfully starts */
        afterServerStart?: (
            client: LanguageClient,
            settings: ISettings,
            outputChannel: LogOutputChannel,
        ) => Promise<void>;

        /** Called if server fails to start */
        onServerStartFailed?: (
            error: Error,
            settings: ISettings,
            outputChannel: LogOutputChannel,
        ) => Promise<void>;

        /** Called during createServer to provide custom state change handling */
        onServerStateChange?: (state: 'stopped' | 'starting' | 'running') => void;

        /** Custom CWD resolution for the server process */
        getServerCwd?: (settings: ISettings, workspaceUri: Uri) => string | undefined;
    };

    // --- Advanced Overrides ---

    /** Custom server script paths (defaults to bundled/tool/lsp_server.py) */
    serverScripts?: { main: string; debug: string };

    /** Custom environment variables for the server process */
    environmentVariables?: Record<string, string | undefined>;

    /** Custom document selector for the language client */
    documentSelector?: DocumentSelector;
}

/**
 * Server info loaded from package.json.
 */
export interface IServerInfo {
    name: string;
    module: string;
}

/**
 * Details about a resolved Python interpreter.
 */
export interface IInterpreterDetails {
    path?: string[];
    resource?: Uri;
}
