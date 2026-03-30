// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as fs from 'fs-extra';
import { IServerInfo } from './types';

const folderName = path.basename(__dirname);
export const EXTENSION_ROOT_DIR =
    folderName === 'common' ? path.dirname(path.dirname(__dirname)) : path.dirname(__dirname);
export const BUNDLED_PYTHON_SCRIPTS_DIR = path.join(EXTENSION_ROOT_DIR, 'bundled');
export const SERVER_SCRIPT_PATH = path.join(BUNDLED_PYTHON_SCRIPTS_DIR, 'tool', 'lsp_server.py');
export const DEBUG_SERVER_SCRIPT_PATH = path.join(BUNDLED_PYTHON_SCRIPTS_DIR, 'tool', '_debug_server.py');

export function loadServerDefaults(): IServerInfo {
    const packageJson = path.join(EXTENSION_ROOT_DIR, 'package.json');
    const content = fs.readFileSync(packageJson).toString();
    const config = JSON.parse(content);
    return config.serverInfo as IServerInfo;
}
