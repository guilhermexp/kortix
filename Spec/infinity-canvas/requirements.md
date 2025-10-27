# Requirements Document

## Introduction

Este documento descreve os requisitos para a funcionalidade "Canvas Infinito" no SuperMemory. A funcionalidade permite que usuários selecionem documentos específicos de um projeto e os organizem em um canvas infinito, onde o chat responderá exclusivamente com base nesses documentos selecionados. O canvas é isolado por projeto e cada documento se torna um card arrastável.

## Requirements

### Requirement 1: Seletor de Documentos

**User Story:** Como um usuário, quero abrir um seletor de documentos a partir do botão infinity para poder escolher quais documentos incluir no meu canvas de trabalho.

#### Acceptance Criteria

1. WHEN o usuário clica no botão "Infinity" THEN o sistema SHALL exibir o canvas vazio E um botão/seletor para adicionar documentos
2. WHEN o usuário ativa o seletor de documentos THEN o sistema SHALL exibir uma lista paginada de todos os documentos do projeto atual
3. WHEN o seletor está aberto THEN o sistema SHALL suportar multi-seleção de documentos através de checkboxes
4. WHEN o usuário confirma a seleção THEN o sistema SHALL adicionar todos os documentos selecionados ao canvas como cards individuais
5. WHEN o projeto atual é alterado THEN o seletor SHALL mostrar apenas documentos do novo projeto

### Requirement 2: Canvas Infinito com Cards

**User Story:** Como um usuário, quero que os documentos selecionados apareçam como cards arrastáveis no canvas para que eu possa organizá-los visualmente.

#### Acceptance Criteria

1. WHEN documentos são selecionados THEN o sistema SHALL criar um card/preview para cada documento no canvas
2. WHEN um card está no canvas THEN o sistema SHALL permitir que o usuário arraste o card para qualquer posição do canvas
3. WHEN múltiplos documentos são selecionados THEN o sistema SHALL posicioná-los de forma distribuída no canvas sem sobreposição inicial
4. WHEN o canvas é alternado para outro projeto THEN o sistema SHALL isolar completamente os cards do projeto anterior
5. WHEN um card é removido do canvas THEN o sistema SHALL remover o documento correspondente do escopo do chat

### Requirement 3: Escopo Dinâmico do Chat

**User Story:** Como um usuário, quero que o chat responda exclusivamente com base nos documentos presentes no canvas para ter conversas contextualizadas.

#### Acceptance Criteria

1. WHEN existe pelo menos um documento no canvas THEN o sistema SHALL restringir as respostas do chat apenas aos documentos presentes no canvas
2. WHEN nenhum documento está no canvas THEN o sistema SHALL retornar o chat ao comportamento global padrão
3. WHEN um documento é adicionado ao canvas THEN o sistema SHALL incluir imediatamente esse documento no escopo do chat para a próxima mensagem
4. WHEN um documento é removido do canvas THEN o sistema SHALL excluir imediatamente esse documento do escopo do chat
5. WHEN o usuário envia uma mensagem com documentos no canvas THEN o sistema SHALL processar a resposta usando apenas os documentIds presentes no canvas

### Requirement 4: Isolamento por Projeto

**User Story:** Como um usuário, quero que cada projeto tenha seu próprio canvas e escopo isolados para manter o contexto organizado.

#### Acceptance Criteria

1. WHEN o usuário troca de projeto THEN o sistema SHALL limpar completamente o canvas atual
2. WHEN um projeto é selecionado THEN o sistema SHALL carregar apenas os documentos daquele projeto no seletor
3. WHEN o canvas contém documentos do Projeto A e o usuário muda para Projeto B THEN o sistema SHALL isolar completamente os contextos
4. WHEN o usuário retorna ao Projeto A THEN o sistema SHALL restaurar o estado anterior do canvas (se implementado)
5. WHEN o chat está ativo com documentos do Projeto A e o usuário muda para Projeto B THEN o sistema SHALL limpar o escopo do chat

### Requirement 5: Reutilização de Componentes

**User Story:** Como desenvolvedor, quero reutilizar componentes existentes para manter consistência visual e reduzir duplicação de código.

#### Acceptance Criteria

1. WHEN cards são exibidos no canvas THEN o sistema SHALL reutilizar o mesmo componente visual da list view existente
2. WHEN a paginação é implementada no seletor THEN o sistema SHALL reutilizar a lógica de paginação da list view
3. WHEN o preview de documento é renderizado THEN o sistema SHALL manter consistência visual com a interface atual
4. WHEN a seleção múltipla é implementada THEN o sistema SHALL usar os mesmos padrões de UI do sistema