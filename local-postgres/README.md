# NuCel sem Supabase — PostgreSQL no PC servidor (homologacao)

**Estado:** implementacao isolada na branch `nucel-postgres-local`. Nao altere o painel em producao enquanto nao passarmos no checklist.

## Arquitetura decidida

- PostgreSQL instalado como **servico do Windows**, no computador que fica ligado 24 horas.
- Next.js NuCel com Node.js no **mesmo computador**, acessando o banco em `127.0.0.1:5432`.
- Colaboradoras entram no painel HTTPS por um **Cloudflare Tunnel nomeado**, com hostname estavel. Requer um dominio ativo na conta Cloudflare.
- O ENGINE scrcpy/ADB continua separado. Ate a integracao remota ser revisada, nao o exponha por um hostname sem autenticacao.
- O Worker antigo permanece inalterado na fase de testes, assim como o comando original `nucel`.

## 0. Salve o banco antigo

Antes de qualquer mudanca, no Supabase pausado clique **Baixar backups**.
Armazene uma copia fora do computador servidor. Nao delete o projeto antigo ainda.
Os usuarios do Supabase Auth precisarao cadastrar novas senhas com convite, pois o novo login nao usa Supabase Auth.

## 1. Instale o PostgreSQL

No PC servidor Windows, baixe o instalador oficial para Windows em:
https://www.postgresql.org/download/windows/

Use PostgreSQL 17 ou superior, com **PostgreSQL Server** e **Command Line Tools**.
A instalacao do servidor deve criar o servico Windows com inicializacao automatica.
Guarde a senha do usuario `postgres` no gerenciador de senhas.

Confirme no PowerShell:
```powershell
Get-Service postgresql*
```

## 2. Crie banco e usuario com privilegios reduzidos

Abra o SQL Shell (psql) do PostgreSQL, conecte-se como `postgres` no banco `postgres`.
Execute cada linha separadamente (nao cole senha em chat):

```sql
CREATE ROLE nucel_app LOGIN;
CREATE DATABASE nucel_db OWNER nucel_app;
```

Depois use este comando especial do **psql** (nao e SQL):
```
\password nucel_app
```

Defina uma senha exclusiva, forte, e guarde-a. Feche com `\q`.

**Seguranca:** mantenha `listen_addresses = 'localhost'` no `postgresql.conf`.
A porta 5432 deve ficar bloqueada para conexoes externas no Firewall do Windows;
nao abra 5432 no roteador. O tunnel deve apontar somente para o painel web.

## 3. Instale a versao de teste sem afetar o NuCel atual

Abra CMD, execute (clona em uma pasta diferente):
```bat
cd /d "%USERPROFILE%\Downloads"
git clone -b nucel-postgres-local https://github.com/Shin11k/NuCel.git NuCel-Postgres-Test
cd NuCel-Postgres-Test
npm install
```

Copie o modelo `local-postgres/CONFIG_EXEMPLO.txt` para um arquivo chamado `.env.local` na raiz do projeto de TESTE e preencha apenas as configuracoes locais. Nao publique esse arquivo.

O script `local-postgres/001_schema.sql` deve ser executado como `nucel_app`, no banco `nucel_db`:

```bat
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -U nucel_app -d nucel_db -v ON_ERROR_STOP=1 -f "local-postgres\001_schema.sql"
```

Se instalou outra versao do PostgreSQL, ajuste o `17` no caminho.

## 4. Teste

```bat
npm run local:doctor
npm run local:owner
npm run dev -- -H 127.0.0.1 -p 3001
```

O ultimo comando mantem o painel de TESTE aberto em http://127.0.0.1:3001/.
A senha temporaria do dono aparece **uma unica vez no CMD** quando `local:owner` cria a conta.

Faça login com NUCEL_OWNER_EMAIL e a senha gerada. Cadastre uma colaboradora de teste;
copie o convite exibido e valide o cadastro em um navegador anonimo.
A equipe antiga nao perde o acesso ao NuCel que continua em producao.

## 5. Antes de migrar a equipe

- Restaurar `nucel_bridges`, `nucel_devices`, `nucel_members` e `nucel_grants` do backup,
  preservando IDs, seriais e relacoes.
- Validar novos logins e convites; usuarios anteriores precisarao configurar senhas novas.
- Configurar hostname estavel via Cloudflare Tunnel no dominio do titular.
- Adaptar a rotina Windows de inicializacao automatica sem `git switch` para a branch antiga.
- Validar a assinatura HMAC, streaming e permissao por aparelho em rede remota.
- Programar `pg_dump` diariamente para outro disco/nuvem, testar restore e alerta de falha.
- Somente entao migrar os acessos da equipe e desativar o Supabase antigo.

**Importante:** PostgreSQL sozinho nao substitui automaticamente Supabase Auth nem o
endereco publico do Worker. O objetivo desta branch e migrar com testes sem interrupcao.
