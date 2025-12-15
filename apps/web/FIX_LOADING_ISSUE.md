# Correção do Problema de Carregamento Infinito

## Problema Identificado
O loader ficava carregando eternamente na lista de memórias/documentos.

## Causas Prováveis
1. **Erros de autenticação (401/403)** não tratados corretamente, causando retries infinitos
2. **Falta de timeout** na query, permitindo carregamento infinito
3. **Tratamento de erros insuficiente** na resposta da API

## Correções Implementadas

### 1. Melhor Tratamento de Erros de Autenticação
- Adicionada verificação específica para erros 401 e 403
- Esses erros não são mais retentados (evita loops infinitos)
- Mensagens de erro mais claras para o usuário

### 2. Validação de Resposta da API
- Adicionada validação da estrutura da resposta
- Verificação se `response.data` e `response.data.documents` existem
- Logs de erro mais detalhados para debug

### 3. Limites de Retry Melhorados
- Erros de autenticação não são mais retentados
- Limite máximo de 2 tentativas para outros erros
- Delay entre tentativas limitado a 5 segundos

### 4. Melhor Feedback ao Usuário
- Mensagens de erro mais informativas
- Indicação específica para erros de autenticação
- Sugestão de ação (refresh ou sign in) quando apropriado

## Arquivos Modificados

1. `apps/web/app/home-client.tsx`
   - Melhorado tratamento de erros na query `useInfiniteQuery`
   - Adicionada validação de resposta
   - Melhor tratamento de erros de autenticação

2. `apps/web/components/memory-list-view.tsx`
   - Melhorada exibição de erros
   - Mensagens mais informativas para erros de autenticação

## Como Testar

1. Verifique se o loader não fica infinito quando há erro de autenticação
2. Verifique se mensagens de erro são exibidas corretamente
3. Verifique se a query para de tentar após 2 tentativas falhadas
4. Verifique se erros 401/403 não causam retries infinitos

## Próximos Passos (se necessário)

Se o problema persistir, verificar:
- Logs do servidor para ver se há erros sendo lançados
- Console do navegador para ver erros de rede
- Se a sessão está sendo validada corretamente no servidor


