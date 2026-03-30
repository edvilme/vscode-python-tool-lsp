// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ToolConfig } from './types';
import { registerLogger, traceError, traceLog, traceVerbose } from './logging';
import { initializePython, onDidChangePythonInterpreter } from './python';
import { restartServer } from './server';
import {
    checkIfConfigurationChanged,
    getWorkspaceSettings,
    ISettings,
} from './settings';
import { loadServerDefaults } from './setup';
import { getInterpreterFromSetting, getProjectRoot } from './utilities';
import { createOutputChannel, onDidChangeConfiguration, registerCommand } from './vscodeapi';
import { registerLanguageStatusItem, updateStatus } from './status';
import { createConfigFileWatchers } from './configWatcher';

const LS_SERVER_RESTART_DELAY = 1000;

let lsClient: LanguageClient | undefined;
let _toolConfig: ToolConfig | undefined;

export async function activateToolExtension(
    context: vscode.ExtensionContext,
    toolConfig: ToolConfig,
): Promise<void> {
    _toolConfig = toolConfig;

    const serverInfo = loadServerDefaults();
    const serverName = toolConfig.displayName;
    const serverId = toolConfig.toolId;

    // Setup logging
    const outputChannel = createOutputChannel(serverName);
    context.subscriptions.push(outputChannel, registerLogger(outputChannel));

    traceLog(`Name: ${serverName}`);
    traceLog(`Module: ${serverInfo.module}`);
    traceVerbose(`Configuration: ${JSON.stringify(serverInfo)}`);

    let isRestarting = false;
    let restartTimer: NodeJS.Timeout | undefined;
    const runServer = async () => {
        if (isRestarting) {
            if (restartTimer) {
                clearTimeout(restartTimer);
            }
            restartTimer = setTimeout(runServer, LS_SERVER_RESTART_DELAY);
            return;
        }
        isRestarting = true;
        try {
            const projectRoot = await getProjectRoot();
            const workspaceSetting = await getWorkspaceSettings(serverId, projectRoot, true);
            if (workspaceSetting.interpreter.length === 0) {
                const pyVer = `${toolConfig.minimumPythonVersion.major}.${toolConfig.minimumPythonVersion.minor}`;
                updateStatus(
                    vscode.l10n.t('Please select a Python interpreter.'),
                    vscode.LanguageStatusSeverity.Error,
                );
                traceError(
                    'Python interpreter missing:\r\n' +
                        '[Option 1] Select python interpreter using the ms-python.python (select interpreter command).\r\n' +
                        `[Option 2] Set an interpreter using "${serverId}.interpreter" setting.\r\n`,
                    `Please use Python ${pyVer} or greater.`,
                );

                if (toolConfig.hooks?.onServerStartFailed) {
                    await toolConfig.hooks.onServerStartFailed(
                        new Error('No interpreter'),
                        workspaceSetting,
                        outputChannel,
                    );
                }
            } else {
                if (toolConfig.hooks?.beforeServerRestart) {
                    const proceed = await toolConfig.hooks.beforeServerRestart(
                        workspaceSetting,
                        serverId,
                        outputChannel,
                    );
                    if (!proceed) {
                        return;
                    }
                }

                lsClient = await restartServer(
                    workspaceSetting,
                    serverId,
                    serverName,
                    outputChannel,
                    lsClient,
                    toolConfig,
                );

                if (lsClient && toolConfig.hooks?.afterServerStart) {
                    await toolConfig.hooks.afterServerStart(lsClient, workspaceSetting, outputChannel);
                }
            }
        } finally {
            isRestarting = false;
        }
    };

    // Register config file watchers
    const configWatchers = toolConfig.configFiles.length > 0
        ? createConfigFileWatchers(toolConfig.configFiles, toolConfig.displayName, runServer)
        : [];

    context.subscriptions.push(
        ...configWatchers,
        onDidChangePythonInterpreter(async () => {
            await runServer();
        }),
        registerCommand(`${serverId}.showLogs`, async () => {
            outputChannel.show();
        }),
        registerCommand(`${serverId}.restart`, async () => {
            await runServer();
        }),
        onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
            if (checkIfConfigurationChanged(e, serverId, toolConfig.configurationChangedKeys)) {
                await runServer();
            }
        }),
        registerLanguageStatusItem(serverId, serverName, `${serverId}.showLogs`),
    );

    // Register additional commands
    if (toolConfig.additionalCommands) {
        for (const cmd of toolConfig.additionalCommands) {
            context.subscriptions.push(registerCommand(cmd.command, cmd.handler));
        }
    }

    // Tool-specific activation hook
    if (toolConfig.hooks?.onActivate) {
        await toolConfig.hooks.onActivate(context, outputChannel);
    }

    setImmediate(async () => {
        const interpreter = getInterpreterFromSetting(serverId);
        if (interpreter === undefined || interpreter.length === 0) {
            traceLog(`Python extension loading`);
            await initializePython(context.subscriptions);
            traceLog(`Python extension loaded`);
        } else {
            await runServer();
        }
    });
}

export async function deactivateToolExtension(): Promise<void> {
    if (_toolConfig?.hooks?.onDeactivate) {
        await _toolConfig.hooks.onDeactivate();
    }
    if (lsClient) {
        try {
            await lsClient.stop();
        } catch (ex) {
            traceError(`Server: Stop failed: ${ex}`);
        }
    }
}
