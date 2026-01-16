# Sistema de Internacionalização (i18n) - Kortix

## 📚 Visão Geral

O Kortix agora suporta **múltiplos idiomas** usando o `next-intl`, a melhor biblioteca de i18n para Next.js 16 App Router.

**Idiomas Suportados:**
- 🇧🇷 Português (pt) - **Idioma padrão**
- 🇺🇸 English (en)

## 🗂️ Estrutura de Arquivos

```
apps/web/
├── i18n/
│   ├── request.ts        # Configuração principal do next-intl
│   ├── actions.ts        # Server actions para mudar idioma
│   └── README.md         # Esta documentação
├── messages/
│   ├── pt.json          # Traduções em português
│   └── en.json          # Traduções em inglês
├── components/
│   └── language-switcher.tsx  # Componente seletor de idioma
└── middleware.ts         # Middleware para gerenciar locale via cookie
```

## 🚀 Como Usar

### 1. Em Client Components

Use o hook `useTranslations` para acessar as traduções:

```tsx
"use client"

import { useTranslations } from "next-intl"

export function MyComponent() {
  const t = useTranslations("menu") // Namespace "menu"

  return (
    <div>
      <h1>{t("addMemory")}</h1>
      <button>{t("chat")}</button>
    </div>
  )
}
```

### 2. Em Server Components

Use `await` com `getTranslations`:

```tsx
import { getTranslations } from "next-intl/server"

export default async function Page() {
  const t = await getTranslations("billing")

  return <h1>{t("freePlan")}</h1>
}
```

### 3. Com Parâmetros/Interpolação

Use chaves `{variavel}` nas traduções:

**messages/pt.json:**
```json
{
  "billing": {
    "memoriesUsed": "{count} / {limit} memórias"
  }
}
```

**Componente:**
```tsx
const t = useTranslations("billing")
// Uso:
t("memoriesUsed", { count: 50, limit: 200 })
// Resultado: "50 / 200 memórias"
```

### 4. Componente Seletor de Idioma

Adicione o seletor de idioma em qualquer lugar:

```tsx
import { LanguageSwitcher } from "@/components/language-switcher"

export function Header() {
  return (
    <div>
      <LanguageSwitcher />
    </div>
  )
}
```

## 📝 Estrutura das Traduções

As traduções são organizadas por **namespaces** (categorias):

```json
{
  "common": {
    "cancel": "Cancelar",
    "done": "Concluído"
  },
  "menu": {
    "addMemory": "Adicionar Memória",
    "chat": "Chat"
  },
  "billing": {
    "freePlan": "Plano Gratuito"
  }
}
```

### Namespaces Disponíveis

| Namespace | Descrição | Exemplos |
|-----------|-----------|----------|
| `common` | Strings comuns (botões, ações) | cancel, done, loading |
| `menu` | Itens de menu e navegação | addMemory, chat, profile |
| `actions` | Ações do usuário | undo, redo, delete |
| `project` | Gestão de projetos | createNew, name |
| `billing` | Planos e cobrança | freePlan, proPlan |
| `auth` | Autenticação | signIn, signOut |
| `integrations` | Integrações e conexões | title, connections |
| `mcp` | Model Context Protocol | title, installKortix |
| `chat` | Interface de chat | newChat, conversations |
| `onboarding` | Primeiros passos | getStarted, install |
| `referral` | Sistema de indicações | inviteFriends |
| `errors` | Mensagens de erro | pageNotFound |
| `toast` | Notificações toast | copiedToClipboard |

## 🔧 Como Adicionar Novas Traduções

1. **Adicione a chave nos arquivos JSON:**

**messages/pt.json:**
```json
{
  "myNamespace": {
    "myKey": "Minha tradução em português"
  }
}
```

**messages/en.json:**
```json
{
  "myNamespace": {
    "myKey": "My translation in English"
  }
}
```

2. **Use no componente:**

```tsx
const t = useTranslations("myNamespace")
return <p>{t("myKey")}</p>
```

## 🎯 Exemplos Práticos

### Exemplo 1: Botão Simples

**Antes:**
```tsx
<button>Create Project</button>
```

**Depois:**
```tsx
const t = useTranslations("project")
<button>{t("create")}</button>
```

### Exemplo 2: Placeholder de Input

**Antes:**
```tsx
<input placeholder="My Awesome Project" />
```

**Depois:**
```tsx
const t = useTranslations("project")
<input placeholder={t("placeholder")} />
```

### Exemplo 3: Mensagem com Parâmetros

**Antes:**
```tsx
<p>{memoriesUsed} / {memoriesLimit} memories</p>
```

**Depois:**
```tsx
const t = useTranslations("billing")
<p>{t("memoriesUsed", { count: memoriesUsed, limit: memoriesLimit })}</p>
```

### Exemplo 4: Toast/Notificação

**Antes:**
```tsx
toast.success("API key copied to clipboard!")
```

**Depois:**
```tsx
const t = useTranslations("toast")
toast.success(t("copiedToClipboard"))
```

## 🛠️ Ferramentas de Desenvolvimento

### Verificar Idioma Atual

```tsx
import { useLocale } from "next-intl"

const locale = useLocale() // "pt" ou "en"
```

### Mudar Idioma Programaticamente

```tsx
import { setLocale } from "@/i18n/actions"

await setLocale("en")
window.location.reload() // Recarrega para aplicar
```

## ⚙️ Configuração Técnica

### Middleware

O middleware define o locale via cookie:
- Cookie: `NEXT_LOCALE`
- Padrão: `pt`
- Duração: 1 ano

### Next.js Config

O `next.config.ts` usa o plugin `next-intl`:

```ts
import createNextIntlPlugin from "next-intl/plugin"
const withNextIntl = createNextIntlPlugin("./i18n/request.ts")
export default withNextIntl(nextConfig)
```

## 📋 Checklist para Converter Componentes

- [ ] Importar `useTranslations` ou `getTranslations`
- [ ] Adicionar traduções em `messages/pt.json` e `messages/en.json`
- [ ] Substituir strings hard-coded por `t("key")`
- [ ] Testar em ambos os idiomas
- [ ] Verificar interpolações de parâmetros

## 🐛 Troubleshooting

### "Cannot find module 'next-intl'"
Certifique-se de que `next-intl` está instalado:
```bash
bun add next-intl
```

### Traduções não aparecem
1. Verifique se o cookie `NEXT_LOCALE` está definido
2. Confirme que as chaves existem em ambos os arquivos JSON
3. Recarregue a página após mudar o idioma

### TypeScript errors
O `next-intl` tem suporte completo ao TypeScript. Se houver erros:
```bash
bun run build
```

## 📚 Recursos

- [Documentação next-intl](https://next-intl-docs.vercel.app/)
- [Next.js 16 App Router](https://nextjs.org/docs/app)
- [Mapeamento completo de strings](../docs/i18n-mapping.md)

---

**Desenvolvido com ❤️ pela equipe Kortix**
