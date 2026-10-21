'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Copy,Loader2,LogOut,Monitor,Play,Plus,Server,ShieldCheck,Smartphone,Users,Wifi,WifiOff,X} from 'lucide-react';
import {toast,Toaster} from 'sonner';

type Device={id:string;name:string;model:string;serial:string;bridge_id:string};
type Connection={id:string;name:string;url:string;token:string};
type Member={id:string;name:string;email:string;role:'admin'|'collaborator'};
type Data={me:Member;devices:Device[];connections:Connection[];members:Member[];grants:{member_id:string;device_id:string}[]};

async function request(body?:Record<string,unknown>){
  const r=await fetch('/api/nucel',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const d=await r.json();
  if(!r.ok) throw new Error(d.error||'Não foi possível continuar.');
  return d;
}
function Brand(){return <div className="brand"><span><Smartphone size={22}/></span><div>NuCel<small>por Nuvix</small></div></div>}

export default function Home(){
  const [data,setData]=useState<Data|null>(null);
  const [code,setCode]=useState('');
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'devices'|'members'|'bridges'>('devices');
  const [modal,setModal]=useState('');
  const [busy,setBusy]=useState(false);
  const [secret,setSecret]=useState('');
  const [selected,setSelected]=useState<Member|null>(null);
  const [grants,setGrants]=useState<string[]>([]);
  const [active,setActive]=useState<string[]>([]);
  const [status,setStatus]=useState<Record<string,string>>({});
  const [bridgeUrlSyncDone,setBridgeUrlSyncDone]=useState(false);

  const refresh=useCallback(async()=>{
    try{
      const r=await fetch('/api/nucel',{cache:'no-store'}); const d=await r.json();
      if(!r.ok){setData(null);setCode(d.code||'');setMessage(d.error||'Não foi possível carregar.');return}
      setData(d);setCode('');setMessage('');
    }catch(e){setData(null);setMessage((e as Error).message)}
  },[]);
  useEffect(()=>{refresh()},[refresh]);
  useEffect(()=>{
    if(!data)return;
    const next:Record<string,string>={};
    data.devices.forEach(device=>{next[device.id]='device'});
    setStatus(next);
  },[data]);

  useEffect(()=>{
    if(!data || data.me.role!=='admin' || bridgeUrlSyncDone || typeof window==='undefined') return;
    const params=new URLSearchParams(window.location.search);
    const bridgeUrl=params.get('bridgeUrl');
    if(!bridgeUrl) return;

    setBridgeUrlSyncDone(true);
    request({action:'updateBridgeUrl',url:bridgeUrl,bridgeName:'PC Principal'})
      .then(async()=>{
        params.delete('bridgeUrl');
        const q=params.toString();
        window.history.replaceState({},'',window.location.pathname+(q?'?'+q:''));
        await refresh();
        toast.success('Conexão do computador atualizada.');
      })
      .catch(e=>{
        setBridgeUrlSyncDone(false);
        toast.error((e as Error).message);
      });
  },[data,bridgeUrlSyncDone,refresh]);

  const admin=data?.me.role==='admin';
  const save=async(e:React.FormEvent<HTMLFormElement>,action:string)=>{
    e.preventDefault();setBusy(true);
    try{
      const values=Object.fromEntries(new FormData(e.currentTarget));
      const r=await request({action,...values});
      if(r.secret){setSecret(r.secret);setModal('secret')}else if(r.invite){setSecret(r.invite);setModal('invite')}else setModal('');
      await refresh();toast.success('Salvo com sucesso.');
    }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };

  return <><Toaster richColors position="bottom-right"/>
    <header className="topbar"><Brand/><div className="userbar"><ShieldCheck size={15}/><span>Ambiente privado</span>{data&&<><b>{data.me.name}</b><em>{admin?'Administrador':'Colaborador'}</em><button onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});setData(null);setCode('UNAUTHENTICATED');setMessage('Entre na sua conta NuCel para continuar.')}}><LogOut size={18}/></button></>}</div></header>
    <main>
      <section className="hero"><div><small>NUVIX / CENTRAL DE CELULARES</small><h1>Seus celulares. <span>Um só lugar.</span></h1><p>Acesse, acompanhe e controle seus aparelhos sem abrir várias janelas.</p></div><div className="hero-mark"><Smartphone size={38}/></div></section>

      {(!data&&(code==='UNAUTHENTICATED'||code==='FORBIDDEN'))?<Auth message={message} done={refresh}/>:
       !data?<div className="state"><Loader2 className="spin"/><b>{message||'Carregando NuCel…'}</b><button onClick={refresh}>Tentar novamente</button></div>:<>
        <nav className="tabs"><button className={tab==='devices'?'active':''} onClick={()=>setTab('devices')}><Smartphone/>Celulares <i>{data.devices.length}</i></button>{admin&&<><button className={tab==='members'?'active':''} onClick={()=>setTab('members')}><Users/>Colaboradores</button><button className={tab==='bridges'?'active':''} onClick={()=>setTab('bridges')}><Server/>Conexões</button></>}</nav>

        {tab==='devices'&&<Devices data={data} status={status} active={active} setActive={setActive} admin={!!admin} add={()=>setModal(data.connections.length?'device':'bridge')}/>}
        {admin&&tab==='members'&&<section><Head title="Colaboradores" text="Libere apenas os celulares que cada pessoa pode usar." action="Adicionar colaborador" click={()=>setModal('member')}/><div className="rows">{data.members.map(m=><article className="row" key={m.id}><div className="avatar">{m.name[0]}</div><div className="grow"><b>{m.name}</b><small>{m.email}</small></div><span className="tag">{m.role==='admin'?'Administrador':data.grants.filter(g=>g.member_id===m.id).length+' aparelhos'}</span>{m.role==='collaborator'&&<><button className="secondary" onClick={()=>{setSelected(m);setGrants(data.grants.filter(g=>g.member_id===m.id).map(g=>g.device_id));setModal('grants')}}>Gerenciar acesso</button><button className="icon" onClick={()=>{setSelected(m);setModal('removeMember')}}><X/></button></>}</article>)}</div></section>}
        {admin&&tab==='bridges'&&<section><Head title="Conexões" text="Cada computador com celulares roda um conector NuCel." action="Novo computador" click={()=>setModal('bridge')}/><div className="rows">{data.connections.map(c=><article className="row" key={c.id}><Server/><div className="grow"><b>{c.name}</b><small>{c.url}</small></div><span className="tag">{data.devices.filter(d=>d.bridge_id===c.id).length} aparelhos</span><button className="secondary" onClick={()=>setModal('device')}><Plus/>Cadastrar celular</button></article>)}</div><div className="hint">O conector roda localmente no Windows e deve ficar disponível por um endereço HTTPS estável.</div></section>}
       </>}
    </main>
    {modal&&data&&<Modal close={()=>{setModal('');setSecret('')}}>
      {modal==='bridge'&&<Form title="Conectar computador" onSubmit={e=>save(e,'bridge')} busy={busy}><Field name="name" label="Nome do computador" placeholder="Servidor principal"/><Field name="url" label="Endereço HTTPS do conector" placeholder="https://conector.seudominio.com"/></Form>}
      {modal==='device'&&<Form title="Adicionar celular" onSubmit={e=>save(e,'device')} busy={busy}><Field name="name" label="Nome" placeholder="Celular 01"/><Field name="model" label="Modelo" placeholder="Moto G60"/><Field name="serial" label="Serial ADB" placeholder="ZY22ABC123"/><label>Computador<select name="bridgeId" required>{data.connections.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label></Form>}
      {modal==='member'&&<Form title="Adicionar colaborador" onSubmit={e=>save(e,'member')} busy={busy}><Field name="name" label="Nome" placeholder="Nome completo"/><Field name="email" label="E-mail" placeholder="nome@empresa.com" type="email"/></Form>}
      {modal==='secret'&&<div className="modal-body"><h2>Computador cadastrado</h2><p>Copie esta chave para o <code>config.json</code> do conector. Ela não deve ser compartilhada.</p><code className="secret">{secret}</code><button className="primary" onClick={async()=>{await navigator.clipboard.writeText(secret);toast.success('Chave copiada.')}}><Copy/>Copiar chave</button></div>}
      {modal==='invite'&&<div className="modal-body"><h2>Convite da colaboradora</h2><p>Envie este codigo diretamente a colaboradora. Ele funciona uma vez so, no cadastro NuCel; nao coloque em grupos.</p><code className="secret">{secret}</code><button className="primary" onClick={async()=>{await navigator.clipboard.writeText(secret);toast.success('Convite copiado.')}}><Copy/>Copiar convite</button></div>}
       {modal==='grants'&&<div className="modal-body"><h2>Acesso de {selected?.name}</h2><div className="grant-list">{data.devices.map(d=><label key={d.id}><input type="checkbox" checked={grants.includes(d.id)} onChange={e=>setGrants(x=>e.target.checked?[...x,d.id]:x.filter(id=>id!==d.id))}/><span><b>{d.name}</b><small>{d.model}</small></span></label>)}</div><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{await request({action:'grants',memberId:selected?.id,deviceIds:grants});setModal('');await refresh();toast.success('Permissões atualizadas.')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>Salvar permissões</button></div>}
      {modal==='removeMember'&&<div className="modal-body"><h2>Remover {selected?.name}?</h2><p>O colaborador perderá o acesso aos aparelhos liberados.</p><button className="danger" onClick={async()=>{await request({action:'removeMember',id:selected?.id});setModal('');await refresh()}}>Remover acesso</button></div>}
    </Modal>}
  </>;
}

function Devices({data,status,active,setActive,admin,add}:{data:Data;status:Record<string,string>;active:string[];setActive:React.Dispatch<React.SetStateAction<string[]>>;admin:boolean;add:()=>void}){
  const online=data.devices.filter(d=>status[d.id]==='device').length;
  return <section><div className="metrics"><Metric icon={<Smartphone/>} n={data.devices.length} t="Aparelhos"/><Metric icon={<Wifi/>} n={online} t="Online"/><Metric icon={<WifiOff/>} n={data.devices.length-online} t="Sem conexão"/><Metric icon={<Monitor/>} n={active.length} t="Telas abertas"/></div><Head title={admin?'Todos os celulares':'Meus celulares'} text={admin?'Organize os aparelhos da operação.':'Aparelhos liberados para sua conta.'} action={admin?'Adicionar celular':undefined} click={add}/><div className="device-grid">{data.devices.map(d=><article className="device" key={d.id}><div className="device-top"><span className={'dot '+(status[d.id]==='device'?'on':'')}/><small>{status[d.id]==='device'?'Online':status[d.id]==='unauthorized'?'Autorizar no aparelho':'Sem conexão'}</small></div><Smartphone className="phone-icon"/><b>{d.name}</b><span>{d.model}</span><button disabled={status[d.id]!=='device'} onClick={()=>setActive(x=>x.includes(d.id)?x:[...x,d.id])}>{active.includes(d.id)?<><Check/>Aberto</>:<><Play/>Iniciar</>}</button></article>)}</div>{!data.devices.length&&<div className="empty">Nenhum celular cadastrado ainda.{admin&&<button onClick={add}>Conectar primeiro aparelho</button>}</div>}<div className="workspace"><div className="workspace-title"><Monitor/>Área de trabalho <small>{active.length} telas abertas</small></div>{active.length?<div className="screens">{active.map(id=>{const d=data.devices.find(x=>x.id===id),c=data.connections.find(x=>x.id===d?.bridge_id);return d&&c?<Phone key={id} d={d} c={c} close={()=>setActive(x=>x.filter(v=>v!==id))}/>:null})}</div>:<div className="workspace-empty"><Monitor size={42}/><b>Inicie um celular para controlar por aqui.</b><span>Abra vários e trabalhe com todos lado a lado.</span></div>}</div></section>
}
function Phone({d,c,close}:{d:Device;c:Connection;close:()=>void}){
  const localBridge=typeof window!=='undefined'&&(window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1')
    ?'http://localhost:8000'
    :'';
  const initial=(process.env.NEXT_PUBLIC_NUCEL_BRIDGE_V2_URL||localBridge||c.url).replace(/\/$/,'');
  const [engine,setEngine]=useState(initial);
  const [playerHeight,setPlayerHeight]=useState(590);
  const frameRef=useRef<HTMLIFrameElement>(null);

  useEffect(()=>{
    if(localBridge||process.env.NEXT_PUBLIC_NUCEL_BRIDGE_V2_URL)return;
    let alive=true;
    fetch('/api/nucel',{cache:'no-store'})
      .then(r=>r.json())
      .then((fresh:Data)=>{
        const current=fresh.connections?.find(x=>x.id===c.id);
        if(alive&&current?.url)setEngine(current.url.replace(/\/$/,''));
      })
      .catch(()=>{});
    return()=>{alive=false};
  },[c.id,localBridge]);

  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      const frame=frameRef.current;
      if(!frame||event.source!==frame.contentWindow)return;
      try{
        if(event.origin!==new URL(engine).origin)return;
      }catch{return}
      const msg=event.data as {type?:string;device?:string;width?:number;height?:number;toolbar?:number};
      if(msg?.type!=='nucel:stream-size'||msg.device!==d.serial)return;
      const w=Number(msg.width),h=Number(msg.height),toolbar=Number(msg.toolbar)||44;
      if(!Number.isFinite(w)||!Number.isFinite(h)||w<100||h<100)return;
      const frameWidth=frame.clientWidth||308;
      const videoWidth=Math.max(180,frameWidth-toolbar);
      const next=Math.round(videoWidth*(h/w));
      setPlayerHeight(Math.max(460,Math.min(720,next)));
    };
    window.addEventListener('message',onMessage);
    return()=>window.removeEventListener('message',onMessage);
  },[engine,d.serial]);

  const src=`${engine}/nucel-direct.html?device=${encodeURIComponent(d.serial)}`;

  return <article className="screen screen-direct">
    <header>
      <span className="dot on"/>
      <div className="screen-name"><b>{d.name}</b><small>{d.model}</small></div>
      <button onClick={close} title="Fechar tela"><X/></button>
    </header>
    <div className="display direct-display" style={{height:playerHeight}}>
      <iframe
        ref={frameRef}
        src={src}
        title={'Controle de '+d.name}
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
      />
    </div>
    <footer>
      <span className="embed-note">H.264 • 30 FPS • controle direto</span>
      <button onClick={close}><X/>Fechar</button>
    </footer>
  </article>
}
function Auth({message,done}:{message:string;done:()=>void}){const[mode,setMode]=useState<'login'|'register'>('login'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);try{const r=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});const d=await r.json();if(!r.ok)throw new Error(d.error);if(d.needsConfirmation){setNotice('Conta criada. Entre com a senha cadastrada.');setMode('login')}else await done()}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}};return <section className="auth"><ShieldCheck size={30}/><h2>Entre no NuCel</h2><p>{message}</p><div className="auth-tabs"><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Entrar</button><button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>Criar conta</button></div><form onSubmit={submit}>{mode==='register'&&<Field name="name" label="Nome" placeholder="Seu nome"/>}<Field name="email" label="E-mail" type="email" placeholder="voce@empresa.com"/><Field name="password" label="Senha" type="password" placeholder="Sua senha"/>{mode==='register'&&<Field name="invite" label="Codigo de convite" placeholder="Codigo entregue pelo administrador"/>}{notice&&<div className="notice">{notice}</div>}<button className="primary" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':'Criar conta'}</button></form></section>}
function Field({name,label,placeholder,type='text'}:{name:string;label:string;placeholder:string;type?:string}){return <label>{label}<input name={name} type={type} placeholder={placeholder} required minLength={type==='password'?8:undefined}/></label>}
function Form({title,onSubmit,busy,children}:{title:string;onSubmit:(e:React.FormEvent<HTMLFormElement>)=>void;busy:boolean;children:React.ReactNode}){return <form className="modal-body" onSubmit={onSubmit}><h2>{title}</h2>{children}<button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar'}</button></form>}
function Modal({children,close}:{children:React.ReactNode;close:()=>void}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><button className="modal-close" onClick={close}><X/></button>{children}</div></div>}
function Head({title,text,action,click}:{title:string;text:string;action?:string;click:()=>void}){return <div className="section-head"><div><h2>{title}</h2><p>{text}</p></div>{action&&<button className="primary" onClick={click}><Plus/>{action}</button>}</div>}
function Metric({icon,n,t}:{icon:React.ReactNode;n:number;t:string}){return <div className="metric"><span>{icon}</span><b>{String(n).padStart(2,'0')}</b><small>{t}</small></div>}
