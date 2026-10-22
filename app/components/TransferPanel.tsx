'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ClipboardCopy, Send } from 'lucide-react';
import { toast } from 'sonner';

type Device = { id: string; name: string; serial: string };
export type ClipboardCommand = {
  id: string;
  device: string;
  type: 'nucel:clipboard-capture' | 'nucel:clipboard-set';
  requestId: string;
  text?: string;
  paste?: boolean;
};
export type ClipboardReply = {
  id: string;
  device: string;
  type: 'nucel:clipboard-result' | 'nucel:clipboard-ack';
  requestId: string;
  text?: string;
  ok?: boolean;
  error?: string;
};

const MAX_TEXT_BYTES = 16384;

function command(detail: ClipboardCommand) {
  window.dispatchEvent(new CustomEvent<ClipboardCommand>('nucel:clipboard:command', { detail }));
}

export default function TransferPanel({ devices, openIds }: { devices: Device[]; openIds: string[] }) {
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [destinations, setDestinations] = useState<string[]>([]);
  const [pasteNow, setPasteNow] = useState(false);
  const [copying, setCopying] = useState(false);
  const pendingCopy = useRef<{ id: string; requestId: string } | null>(null);
  const pendingSends = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const receive = (event: Event) => {
      const msg = (event as CustomEvent<ClipboardReply>).detail;
      if (!msg || !msg.id || !msg.requestId) return;
      const device = devices.find(d => d.id === msg.id && d.serial === msg.device);
      if (!device) return;
      const capture = pendingCopy.current;
      if (msg.type === 'nucel:clipboard-result' && capture?.id === device.id &&
          capture.requestId === msg.requestId) {
        pendingCopy.current = null;
        setCopying(false);
        if (typeof msg.text === 'string' && msg.text.length) {
          setText(msg.text);
          toast.success('Texto capturado de ' + device.name + '.');
        } else {
          toast.error('Nao veio texto do Android. Selecione e copie novamente.');
        }
      }
      if (msg.type === 'nucel:clipboard-ack') {
        if (capture?.id === device.id && capture.requestId === msg.requestId && !msg.ok) {
          pendingCopy.current = null;
          setCopying(false);
          toast.error(msg.error || 'Nao foi possivel copiar.');
        }
        if (pendingSends.current.get(msg.requestId) === device.id) {
          pendingSends.current.delete(msg.requestId);
          if (msg.ok) toast.success('Texto encaminhado para ' + device.name + '.');
          else toast.error(device.name + ': ' + (msg.error || 'erro no ENGINE'));
        }
      }
    };
    window.addEventListener('nucel:clipboard:reply', receive);
    return () => window.removeEventListener('nucel:clipboard:reply', receive);
  }, [devices]);

  const capture = () => {
    const device = devices.find(d => d.id === source);
    if (!device || !openIds.includes(device.id)) {
      toast.error('Abra a tela do celular de origem primeiro.');
      return;
    }
    const requestId = 'copy_' + Date.now();
    pendingCopy.current = { id: device.id, requestId };
    setCopying(true);
    command({ id: device.id, device: device.serial, type: 'nucel:clipboard-capture', requestId });
    setTimeout(() => {
      if (pendingCopy.current?.requestId === requestId) {
        pendingCopy.current = null;
        setCopying(false);
        toast.error('O celular nao retornou texto. Selecione um trecho no Android antes de copiar.');
      }
    }, 10000);
  };

  const send = () => {
    if (!text.trim()) {
      toast.error('Digite ou copie algum texto.');
      return;
    }
    if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
      toast.error('O texto deve ter no maximo 16 KB.');
      return;
    }
    const targets = devices.filter(d => destinations.includes(d.id) && openIds.includes(d.id));
    if (!targets.length) {
      toast.error('Selecione pelo menos um destino com a tela aberta.');
      return;
    }
    targets.forEach((device, index) => {
      const requestId = 'paste_' + Date.now() + '_' + index;
      pendingSends.current.set(requestId, device.id);
      command({
        id: device.id,
        device: device.serial,
        type: 'nucel:clipboard-set',
        requestId,
        text,
        paste: pasteNow,
      });
      setTimeout(() => {
        if (pendingSends.current.has(requestId)) {
          pendingSends.current.delete(requestId);
          toast.error(device.name + ': sem confirmacao. Confira se a tela esta conectada.');
        }
      }, 7000);
    });
  };

  return (
    <section className="transfer-panel">
      <div className="transfer-heading">
        <h2><ArrowRightLeft size={19} /> Transferir texto</h2>
        <p>Copie texto de um celular e envie para outro sem sair do NuCel.</p>
      </div>
      <div className="transfer-columns">
        <div className="transfer-group">
          <label htmlFor="nucel-clip-source">Origem</label>
          <select id="nucel-clip-source" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">Selecione um celular</option>
            {devices.map(d => (
              <option value={d.id} key={d.id}>
                {d.name}{!openIds.includes(d.id) ? ' (tela fechada)' : ''}
              </option>
            ))}
          </select>
          <button className="secondary" disabled={!source || copying || !openIds.includes(source)} onClick={capture}>
            <ClipboardCopy size={16} /> {copying ? 'Copiando...' : 'Capturar texto selecionado'}
          </button>
          <small>Selecione um texto na tela Android antes de capturar. Voce tambem pode digitar o texto ao lado.</small>
        </div>
        <div className="transfer-group">
          <label htmlFor="nucel-clip-text">Texto</label>
          <textarea id="nucel-clip-text" rows={4} maxLength={MAX_TEXT_BYTES} value={text}
            placeholder="O texto copiado do celular aparece aqui. Ou escreva/cole manualmente."
            onChange={e => setText(e.target.value)} />
          <small>{new TextEncoder().encode(text).byteLength} / {MAX_TEXT_BYTES} bytes. Nada e salvo no banco.</small>
        </div>
        <div className="transfer-group">
          <span className="transfer-label">Destinos</span>
          <div className="transfer-targets">
            {devices.map(d => (
              <label key={d.id} className={!openIds.includes(d.id) ? 'disabled' : ''}>
                <input type="checkbox" disabled={!openIds.includes(d.id)} checked={destinations.includes(d.id)}
                  onChange={e => setDestinations(prev => e.target.checked ?
                    [...prev, d.id] : prev.filter(id => id !== d.id))} />
                <span>{d.name}<small>{openIds.includes(d.id) ? 'Tela aberta' : 'Inicie o celular'}</small></span>
              </label>
            ))}
          </div>
          <label className="transfer-paste"><input type="checkbox" checked={pasteNow}
            onChange={e => setPasteNow(e.target.checked)} />
            Colar no campo Android que estiver em foco
          </label>
          <button className="primary" disabled={!text.trim() || !destinations.some(id => openIds.includes(id))}
            onClick={send}><Send size={16} /> Enviar texto aos selecionados</button>
          <small>Se nao marcar a opcao, o texto vai apenas para o clipboard dos aparelhos. Nao envia mensagens.</small>
        </div>
      </div>
    </section>
  );
}
