# memory-document-upgrade-research

Objetivo: transformar uma memória/documento em um guia atualizado, acionável e otimizado para LLM.

## Fluxo obrigatório

1. Ler integralmente o conteúdo original do documento (ou conjunto de documentos relacionados).
2. Entender o tema principal e mapear:
- o que já está correto;
- o que está desatualizado;
- o que está faltando para uso prático.
3. Acionar agentes/subagentes de pesquisa para buscar:
- práticas mais atuais;
- padrões recomendados;
- alternativas válidas (melhor custo, melhor manutenção, melhor performance, menor complexidade), quando fizer sentido.
4. Consolidar tudo em Markdown estruturado para consumo por LLM.
5. Incluir referências e links úteis no final.
6. Se houver opções melhores/mais baratas/mais atualizadas, apresentar comparação objetiva.

## Formato de saída (sempre em Markdown)

Use esta estrutura:

## Visão Geral
- Resumo curto do tema e objetivo.

## Estado Atual (a partir do conteúdo original)
- O que existe hoje.
- Pontos fortes.
- Lacunas e riscos.

## Guia de Uso (passo a passo)
1. Passo 1
2. Passo 2
3. Passo 3

## Melhores Práticas Atuais
- Lista objetiva com justificativa curta.

## Alternativas e Comparativo
- Opção, custo relativo, quando usar, trade-offs.

## Plano Recomendado
- Recomendação final para melhor resultado.

## Referências
- Links oficiais, documentação, artigos técnicos relevantes.

## Regras de qualidade

- Escrever de forma direta, técnica e sem floreio.
- Não inventar fatos: se houver incerteza, explicitar.
- Priorizar fontes oficiais e documentação primária.
- Entregar conteúdo acionável para execução imediata.
- Evitar texto genérico; focar em decisão prática.
- Sempre considerar que o consumidor final é outro agente/LLM.

## Regras de atualização

- Sempre que houver conflito entre conteúdo antigo e prática atual, priorizar a prática atual e marcar a divergência.
- Se houver várias opções equivalentes, sugerir a de melhor relação custo-benefício e explicar.

