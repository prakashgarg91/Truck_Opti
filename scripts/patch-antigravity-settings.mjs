/**
 * Patches the Antigravity user_settings.pb to enable terminal auto-execution (turbo mode).
 *
 * Proto structure (field numbers from extension.js reverse engineering):
 *   UserSettings (root message):
 *     field 3: turbo_mode_setting (message TurboModeSetting)
 *       field 1: terminal_auto_execution_enabled (bool)
 *
 * Protobuf wire encoding:
 *   field tag = (field_number << 3) | wire_type
 *   wire type 0 = varint, wire type 2 = length-delimited (message/string)
 *
 *   TurboModeSetting { terminal_auto_execution_enabled: true }
 *     field 1, wire_type 0 (varint): tag = (1 << 3) | 0 = 0x08, value = 0x01
 *     bytes: [0x08, 0x01]
 *
 *   UserSettings { turbo_mode_setting: <above> }
 *     field 3, wire_type 2 (length-delimited): tag = (3 << 3) | 2 = 0x1A
 *     length = 2, data = [0x08, 0x01]
 *     bytes: [0x1A, 0x02, 0x08, 0x01]
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const settingsPbPath = join(os.homedir(), '.gemini', 'antigravity', 'user_settings.pb');
const backupPath = settingsPbPath + '.backup';

if (!existsSync(settingsPbPath)) {
    console.log('user_settings.pb not found at:', settingsPbPath);
    process.exit(1);
}

// Backup original
copyFileSync(settingsPbPath, backupPath);
console.log('✅ Backed up to:', backupPath);

// Read existing bytes
const existing = readFileSync(settingsPbPath);
console.log('📄 Existing file size:', existing.length, 'bytes');
console.log('📄 Existing hex:', existing.toString('hex'));

// Turbo mode setting bytes:
// TurboModeSetting { terminal_auto_execution_enabled: true }
// = [field1, varint, value1] = [0x08, 0x01]
// Wrapped in UserSettings field 3 (length-delimited):
// = [0x1A, 0x02, 0x08, 0x01]
const turboModeBytes = Buffer.from([0x1A, 0x02, 0x08, 0x01]);

// Check if turbo_mode_setting is already present (tag 0x1A)
function findFieldTag(buf, tag) {
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] === tag) return i;
    }
    return -1;
}

const turboTag = 0x1A;
const existingTurboIdx = findFieldTag(existing, turboTag);

let newBuf;
if (existingTurboIdx !== -1) {
    console.log('🔄 Turbo mode setting already present at offset', existingTurboIdx, '- patching in place...');
    // Replace the 4 bytes starting at existingTurboIdx
    newBuf = Buffer.concat([
        existing.slice(0, existingTurboIdx),
        turboModeBytes,
        existing.slice(existingTurboIdx + 4)
    ]);
} else {
    console.log('➕ Turbo mode setting not found - appending...');
    newBuf = Buffer.concat([existing, turboModeBytes]);
}

writeFileSync(settingsPbPath, newBuf);
console.log('✅ Patched user_settings.pb written:', newBuf.length, 'bytes');
console.log('📄 New hex:', newBuf.toString('hex'));
console.log('');
console.log('🎉 Done! Restart Antigravity for the change to take effect.');
console.log('   The "terminal_auto_execution_enabled" flag is now set to TRUE.');
console.log('   To restore the original, run: copy "' + backupPath + '" "' + settingsPbPath + '"');
