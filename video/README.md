# Vídeo-tutoriais (Playwright + Remotion)

Pipeline que **grava o app real** com Playwright e **legenda** com Remotion.
Gera, para cada seção, um vídeo **desktop (16:9)** e um **mobile (9:16)** com
mockup de celular e indicador de toque.

Seções: `pdv`, `estoque`, `vendas`, `consignacoes`, `relatorios`, `configuracoes`.

## Como funciona
1. `seed` cria uma **conta de demonstração isolada** no Supabase e semeia
   produtos, cliente e uma consignação em aberto (não toca na loja real).
2. `capture` loga uma vez e dirige **cada seção** do app real (desktop + mobile),
   salvando `public/<id>[-mobile].webm` + `public/chapters-<id>[-mobile].json`.
3. `render` monta os MP4 finais em `out/` (intro → gravação legendada → outro).

## Pré-requisitos (uma vez)
```bash
cd video
npm install
npx playwright install chromium
```

## Gerar todos os vídeos
Com o app rodando (na raiz: `npm run dev`, em http://localhost:3000):
```bash
cd video
npm run seed        # conta demo + dados
npm run capture     # grava todas as seções (desktop + mobile)
npm run render      # gera todos os MP4 em out/
```
Atalho: `npm run make` (precisa do app já rodando).

### Filtrar seções / formato
```bash
npm run capture -- estoque relatorios       # só essas seções
npm run capture -- --desktop                # só desktop
npm run render  -- pdv --mobile             # renderiza só pdv-mobile
```
Contra produção: `VIDEO_BASE_URL=https://SEU-APP.vercel.app npm run capture`

## Prévia interativa
```bash
npm run studio    # abre o Remotion Studio (ajustar estilo/legendas)
```

## Estrutura
- `capture/flows.mjs` — os passos + legendas de cada seção (edite aqui para
  ajustar o roteiro). Seletores independentes de layout servem desktop e mobile.
- `capture/runner.mjs` — motor de captura (login, gravação, ripple de toque).
- `src/Tutorial.tsx` / `src/TutorialMobile.tsx` — composições Remotion genéricas.
- `src/Root.tsx` + `src/sections.ts` — registram 2 vídeos por seção.

## Limpeza
```bash
npm run cleanup   # apaga os dados de demonstração criados
```
(A conta de auth de demo permanece órfã — apague em Supabase → Authentication → Users.)
