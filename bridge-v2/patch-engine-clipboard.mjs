// Estende somente a API publica da copia local do ws-scrcpy-web.
// Nao altera acesso remoto, tunneling ou database. Idempotente, fail-closed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const engine = path.join(root, '.engine', 'ws-scrcpy-web');
const files = {
  types: path.join(engine, 'src', 'app', 'public', 'types.ts'),
  api: path.join(engine, 'src', 'app', 'public', 'startStream.ts'),
};
const MARK = '// NUCEL_CLIPBOARD_V1';
const source = {};
for (const [key, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    console.error('[NuCel Clipboard] ENGINE sem arquivo requerido:', file);
    process.exit(1);
  }
  source[key] = fs.readFileSync(file, 'utf8');
}
function add(key, needle, replacement) {
  if (source[key].includes(replacement)) return;
  if (!source[key].includes(needle)) {
    throw new Error('ENGINE incompatível com patch NuCel Clipboard: ' + key + ' sem ponto de integração esperado');
  }
  source[key] = source[key].replace(needle, replacement);
}
try {
  add('types',
    '    // Lifecycle callbacks',
    `    ${MARK}
    onClipboard?: ((text: string) => void) | undefined;
    // Lifecycle callbacks`);
  add('types',
    'export interface StreamHandle {',
    `export interface StreamHandle {
    ${MARK}
    /** Envia texto ao clipboard Android; paste=true cola no campo focado sem enviar. */
    sendClipboard(text: string, paste?: boolean): boolean;
    /** Emite COPY para selecao atual e le o evento de clipboard do Android. */
    copySelection(): boolean;`);
  add('api',
    "import { ACTION } from '../../common/Action';",
    `import { ACTION } from '../../common/Action';
${MARK}
import { CommandControlMessage } from '../controlMessage/CommandControlMessage';
import DeviceMessage from '../googDevice/DeviceMessage';`);
  add('api',
    '    let stopFn: (() => void) | undefined;',
    `    let stopFn: (() => void) | undefined;
    ${MARK}
    let clipboardInstance: StreamClientScrcpy | undefined;`);
  add('api',
    '        stopFn = () => {',
    `        ${MARK}
        clipboardInstance = instance;
        const originalClipboardHandler = instance.OnDeviceMessage;
        instance.OnDeviceMessage = (data: Uint8Array): void => {
            originalClipboardHandler(data);
            if (data[0] === DeviceMessage.TYPE_CLIPBOARD && options.onClipboard) {
                try {
                    options.onClipboard(DeviceMessage.fromRaw(data).getText());
                } catch (err) {
                    console.warn('[NuCel Clipboard] evento invalido', err);
                }
            }
        };
        stopFn = () => {`);
  add('api',
    '    return {\n        stop(): void {',
    `    return {
        ${MARK}
        sendClipboard(text: string, paste = false): boolean {
            if (!isConnected || !clipboardInstance || typeof text !== 'string' ||
                text.length < 1 || new TextEncoder().encode(text).length > 16384) return false;
            clipboardInstance.sendMessage(CommandControlMessage.createSetClipboardCommand(text, paste));
            return true;
        },
        copySelection(): boolean {
            if (!isConnected || !clipboardInstance) return false;
            clipboardInstance.sendMessage(CommandControlMessage.createGetClipboardCommand(
                CommandControlMessage.COPY_KEY_COPY
            ));
            return true;
        },
        stop(): void {`);
} catch (error) {
  console.error('[NuCel Clipboard]', error.message);
  process.exit(1);
}

for (const [key, file] of Object.entries(files)) {
  if (source[key] !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, source[key], 'utf8');
    console.log('[NuCel Clipboard] atualizado:', path.basename(file));
  } else {
    console.log('[NuCel Clipboard] já aplicado:', path.basename(file));
  }
}
