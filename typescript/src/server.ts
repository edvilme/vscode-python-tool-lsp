// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fsapi from 'fs-extra';
import { Disposable, env, l10n, LanguageStatusSeverity, LogOutputChannel, Uri } from 'vscode';
import { State } from 'vscode-languageclient';
import {
    LanguageClient,
    LanguageClientOptions,
    RevealOutputChannelOn,
    ServerOptions,
} from 'vscode-languageclient/node';
import { DEBUG_SERVER_SCRIPT_PATH, SERVER_SCRIPT_PATH } from './setup';
import { traceError, traceInfo, traceVerbose } from './logging';
import { getDebuggerPath } from './python';
import { getExtensionSettings, getGlobalSettings, ISettings } from './settings';
import { getDocumentSelector, getLSClientTraceLevel } from './utilities';
import { updateStatus } from './status';
import { ToolConfig } from './types';
import { getConfiguration } from './vscodeapi';

export type IInitOptions = { settings: ISettings[]; globalSettings: ISettings };

function parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }
        const key = trimmed.substring(0, eqIndex).trim().replace(/^export\s+/, '');
        let value = trimmed.substring(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key) {
            env[key] = value;
        }
    }
    return env;
}

async function loadEnvVarsFromFile(workspace: Uri): Promise<Record<string, string>> {
    const pythonConfig = getConfiguration('python', workspace);
    let envFileSetting = pythonConfig.get<string>('envFile', '${workspaceFolder}/.env');
    envFileSetting = envFileSetting.replace('${workspaceFolder}', workspace.fsPath);

    if (!envFileSetting || !(await fsapi.pathExists(envFileSetting))) {
        return {};
    }

    try {
        const content = await fsapi.readFile(envFileSetting, 'utf-8');
        traceInfo(`Loaded environment variables from ${envFileSetting}`);
        return parseEnvFile(content);
    } catch (ex) {
        traceError(`Failed to read env file ${envFileSetting}: ${ex}`);
        return {};
    }
}

async function createServer(
    settings: ISettings,
    serverId: string,
    serverName: string,
    outputChannel: LogOutputChannel,
    initializationOptions: IInitOptions,
    toolConfig?: ToolConfig,
): Promise<LanguageClient> {
    const command = settings.interpreter[0];
    const workspaceUri = Uri.file(settings.workspace);
    const cwd = settings.cwd === '${fileDirname}' ? workspaceUri.fsPath : settings.cwd;

    // Set debugger path needed for debugging python code.
    const newEnv = { ...process.env };
    const envFileVars = await loadEnvVarsFromFile(workspaceUri);
    Object.assign(newEnv, envFileVars);
    const debuggerPath = await getDebuggerPath();

    const serverScript = toolConfig?.serverScripts?.main ?? SERVER_SCRIPT_PATH;
    const debugScript = toolConfig?.serverScripts?.debug ?? DEBUG_SERVER_SCRIPT_PATH;
    const isDebugScript = await fsapi.pathExists(debugScript);

    if (newEnv.USE_DEBUGPY && debuggerPath) {
        newEnv.DEBUGPY_PATH = debuggerPath;
    } else {
        newEnv.USE_DEBUGPY = 'False';
    }

    // Set import strategy
    newEnv.LS_IMPORT_STRATEGY = settings.importStrategy;

    // Set notification type
    newEnv.LS_SHOW_NOTIFICATION = settings.showNotifications;

    // Apply tool-specific environment variables
    if (toolConfig?.environmentVariables) {
        for (const [key, value] of Object.entries(toolConfig.environmentVariables)) {
            if (value !== undefined) {
                newEnv[key] = value;
            }
        }
    }

    const args =
        newEnv.USE_DEBUGPY === 'False' || !isDebugScript
            ? settings.interpreter.slice(1).concat([serverScript])
            : settings.interpreter.slice(1).concat([debugScript]);
    traceInfo(`Server run command: ${[command, ...args].join(' ')}`);

    const serverOptions: ServerOptions = {
        command,
        args,
        options: { cwd, env: newEnv },
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: toolConfig?.documentSelector ?? getDocumentSelector(),
        outputChannel: outputChannel,
        traceOutputChannel: outputChannel,
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        initializationOptions,
    };

    return new LanguageClient(serverId, serverName, serverOptions, clientOptions);
}

let _disposables: Disposable[] = [];

export async function restartServer(
    workspaceSetting: ISettings,
    serverId: string,
    serverName: string,
    outputChannel: LogOutputChannel,
    oldLsClient?: LanguageClient,
    toolConfig?: ToolConfig,
): Promise<LanguageClient | undefined> {
    if (oldLsClient) {
        traceInfo(`Server: Stop requested`);
        try {
            await oldLsClient.stop();
        } catch (ex) {
            traceError(`Server: Stop failed: ${ex}`);
        }
    }
    _disposables.forEach((d) => d.dispose());
    _disposables = [];
    updateStatus(undefined, LanguageStatusSeverity.Information, true);

    const newLSClient = await createServer(
        workspaceSetting,
        serverId,
        serverName,
        outputChannel,
        {
            settings: await getExtensionSettings(serverId, true),
            globalSettings: await getGlobalSettings(serverId, false),
        },
        toolConfig,
    );

    traceInfo(`Server: Start requested.`);
    _disposables.push(
        newLSClient.onDidChangeState((e) => {
            switch (e.newState) {
                case State.Stopped:
                    traceVerbose(`Server State: Stopped`);
                    toolConfig?.hooks?.onServerStateChange?.('stopped');
                    break;
                case State.Starting:
                    traceVerbose(`Server State: Starting`);
                    toolConfig?.hooks?.onServerStateChange?.('starting');
                    break;
                case State.Running:
                    traceVerbose(`Server State: Running`);
                    updateStatus(undefined, LanguageStatusSeverity.Information, false);
                    toolConfig?.hooks?.onServerStateChange?.('running');
                    break;
            }
        }),
    );
    try {
        await newLSClient.start();
    } catch (ex) {
        updateStatus(l10n.t('Server failed to start.'), LanguageStatusSeverity.Error);
        traceError(`Server: Start failed: ${ex}`);
    }
    await newLSClient.setTrace(getLSClientTraceLevel(outputChannel.logLevel, env.logLevel));
    return newLSClient;
}
