# Docenti

Aplicativo desktop para montar, pontuar e exportar **dossiês docentes**, portfólios de comprovantes usados em processos como progressão, promoção e avaliação de desempenho. Projeto de TCC desenvolvido na UTFPR.

## Visão geral do sistema

O sistema tem duas partes independentes:

```
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  App desktop (Electron)      │  HTTP(S) │  Servidor (opcional)         │
│                              │ ───────► │                              │
│  • interface React           │          │  • login por código no e-mail│
│  • banco SQLite local        │ ◄─────── │  • sincronização entre       │
│  • arquivos no computador    │          │    dispositivos              │
│  • funciona offline          │          │  • modelos oficiais          │
└──────────────────────────────┘          └──────────────────────────────┘
```

- **O app é local-first.** Todos os dados ficam no computador do usuário (SQLite + pasta de arquivos) e o app funciona sem internet. O servidor é usado apenas para login, sincronização e distribuição de modelos oficiais.
- **Cada instituição roda o seu servidor.** O usuário informa o endereço do servidor na tela de login, e o servidor define quais domínios de e-mail podem entrar (por exemplo, `@utfpr.edu.br`).
- **Modo convidado.** É possível usar o app sem conta e sem servidor; nesse caso os dados ficam apenas no computador.

## Conceitos principais

| Conceito | O que é |
|---|---|
| **Coleção** | Um dossiê, por exemplo "Progressão 2026". Pode ser criada do zero ou a partir de um modelo. |
| **Grupo → Subgrupo → Categoria** | A estrutura da coleção. Grupos e subgrupos podem ter pontuação mínima e máxima; cada **categoria** tem uma **regra de pontuação**. |
| **Regra de pontuação** | Define quanto cada documento vale: **fixa** (N pontos por documento), **por horas** (pontos a cada N horas), **com teto** ou **com teto por documento**. |
| **Documento** | Um comprovante (certificado, declaração etc.) com seu arquivo. Fica na biblioteca do usuário e pode ser vinculado a uma ou mais categorias. |
| **Tag** | Marcador livre para organizar documentos na biblioteca. |
| **Modelo** | A estrutura pronta de uma coleção (grupos, categorias e regras). Os **oficiais** vêm do servidor da instituição; os **importados** são arquivos `.json` trazidos pelo usuário. |
| **Exportação** | Gera relatório (PDF, Excel, CSV, JSON) e o dossiê com os arquivos: um PDF unido por categoria ou um ZIP com os documentos separados em pastas. |
| **Revisão** | Leitura de uma coleção exportada por outra pessoa. O app recalcula as pontuações e aponta divergências entre os valores enviados e o recálculo. |
| **Sincronização** | Com uma conta, as alterações são enviadas ao servidor e chegam aos outros dispositivos do mesmo usuário. Cada coleção pode ser mantida apenas local. |

## Estrutura de pastas

```
.
├── electron/              Processo principal do Electron (acesso a disco, banco e rede)
│   ├── main.ts            Inicialização do app e registro dos handlers
│   ├── preload.ts         Ponte segura entre a interface e o processo principal (window.api)
│   ├── ipc/               Um arquivo por domínio (coleções, documentos, sessão, servidor...)
│   ├── db.ts              Banco SQLite, um por usuário
│   ├── store.ts           Configurações do dispositivo e sessão
│   ├── sync/              Motor de sincronização (fila de alterações, envio e recebimento)
│   ├── dossier/           Geração do dossiê (união de PDFs, ZIP)
│   └── templates.ts       Modelos oficiais e importados
│
├── src/                   Interface (React + Vite)
│   ├── components/        Telas e componentes, organizados por área
│   ├── store/             Estado compartilhado (Zustand), um por domínio
│   ├── repository/        Únicos arquivos que chamam window.api ou o servidor
│   ├── services/          Regras de negócio sem interface: pontuação, relatórios,
│   │                      exportação do dossiê, importação e revisão
│   ├── i18n/              Traduções (pt-BR e en)
│   └── types/             Tipos compartilhados da interface
│
├── shared/                Código usado pelo app e pelo servidor
│                          (protocolo de sincronização, validação de modelos,
│                          política de e-mail, endereço do servidor)
│
├── server/                Servidor (projeto separado, com seu próprio package.json)
│   ├── src/routes/        Rotas: auth (login), sync e templates
│   ├── templates/         Modelos oficiais publicados
│   ├── scripts/           publish-template: valida e publica um modelo
│   └── docker-compose.yml Postgres, Redis e Mailpit para desenvolvimento
│
├── tests/unit/            Testes (Vitest)
└── scripts/               Utilitários de build e para limpar dados locais
```

A interface nunca acessa disco ou banco diretamente: ela chama `src/repository/`, que passa por `window.api` (definida em `electron/preload.ts`) até os handlers em `electron/ipc/`.

## Como executar

### App desktop

```bash
npm install
npm run dev      # modo de desenvolvimento
npm run test     # testes
npm run build    # gera o instalador em release/
```

### Servidor

```bash
cd server
npm install
docker compose up -d   # Postgres, Redis e Mailpit
npm run dev            # API em http://localhost:3000
```

No app, informe `localhost:3000` na aba **Servidor** da tela de login. Os códigos de login enviados por e-mail aparecem no Mailpit, em `http://localhost:8025`.

Configurações do servidor (arquivo `server/.env`):

| Variável | Para que serve |
|---|---|
| `ALLOWED_EMAIL_DOMAINS` | Domínios que podem entrar, separados por vírgula (ex.: `utfpr.edu.br`). Vazio = qualquer e-mail. |
| `INSTITUTION_NAME` | Nome exibido no app (ex.: `UTFPR`). |
| `SUPPORT_EMAIL`, `SUPPORT_URL` | Contato exibido na tela de Suporte do app. Opcionais; o endereço precisa ser `http(s)`. |
| `DATABASE_URL`, `REDIS_URL`, `SMTP_HOST`, `SMTP_PORT`, `PORT` | Conexões e porta da API. |

Para publicar um modelo oficial: `npm run publish-template -- caminho/do/modelo.template.json` (dentro de `server/`).
