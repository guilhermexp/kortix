# Requirements: document-processing-refactor

## 1. Overview
**Goal**: Refatorar completamente o sistema de processamento de documentos para eliminar instabilidades e criar uma arquitetura sólida e confiável para produção.

**User Problem**: O sistema atual falha constantemente - às vezes funciona tudo, às vezes só URL, às vezes só YouTube, às vezes o preview para de funcionar. É impossível confiar para produção.

## 2. Functional Requirements

### 2.1 Core Architecture Requirements
- [ ] **FR-1**: Separar completamente responsabilidades entre serviços (extração, processamento, preview)
- [ ] **FR-2**: Eliminar toda duplicação de código de extração de conteúdo
- [ ] **FR-3**: Criar interfaces bem definidas entre componentes
- [ ] **FR-4**: Implementar tratamento de erros robusto e consistente

### 2.2 Service Separation Requirements
- [ ] **FR-5**: DocumentExtractorService - responsabilidade única: extrair conteúdo
- [ ] **FR-6**: DocumentProcessorService - responsabilidade única: processar e enriquecer
- [ ] **FR-7**: PreviewGeneratorService - responsabilidade única: gerar previews
- [ ] **FR-8**: IngestionOrchestratorService - responsabilidade única: orquestrar o fluxo

### 2.3 Reliability Requirements
- [ ] **FR-9**: Cada serviço deve ter fallback robusto para seus casos de uso
- [ ] **FR-10**: Validação rigorosa de entrada em todos os pontos críticos
- [ ] **FR-11**: Logging estruturado para debugging fácil
- [ ] **FR-12**: Circuit breaker pattern para serviços externos

### 2.4 Content Type Support Requirements
- [ ] **FR-13**: URLs web - extração confiável com Firecrawl
- [ ] **FR-14**: YouTube - extração robusta de transcrições
- [ ] **FR-15**: PDFs - OCR com fallback múltiplo
- [ ] **FR-16**: Arquivos Office (DOCX, XLSX) - extração confiável
- [ ] **FR-17**: Repositórios GitHub - extração estruturada
- [ ] **FR-18**: Texto plano - processamento direto

### 2.5 Preview Generation Requirements
- [ ] **FR-19**: Preview automático para todos os tipos de documento
- [ ] **FR-20**: Fallback para favicon quando extração falha
- [ ] **FR-21**: Preview SVG gerado para documentos sem imagem
- [ ] **FR-22**: Cache de previews para performance

## 3. Technical Requirements

### 3.1 Architecture Constraints
- **Technology**: TypeScript/Node.js (manter stack atual)
- **Dependencies**: Manter Supabase, Firecrawl, Gemini, Replicate
- **Database**: Manter estrutura atual, apenas otimizar queries
- **API**: Manter compatibilidade com endpoints existentes

### 3.2 Performance Requirements
- **Response Time**: < 30s para documentos pequenos (< 1MB)
- **Scalability**: Suportar até 100 documentos simultâneos
- **Memory**: < 512MB por processo de ingestão
- **Rate Limiting**: Respeitar limites de APIs externas

### 3.3 Error Handling Requirements
- **Graceful Degradation**: Sistema continua funcionando mesmo com falhas parciais
- **Retry Logic**: Retry automático com backoff exponencial
- **Error Recovery**: Capacidade de retomar processamento após falhas
- **Monitoring**: Alertas automáticos para falhas críticas

## 4. Acceptance Criteria

### 4.1 Stability Criteria
- [ ] Sistema funciona consistentemente para todos os tipos de documento
- [ ] Nenhuma regressão de funcionalidade existente
- [ ] Zero duplicação de código de extração
- [ ] 100% dos testes existentes continuam passando

### 4.2 Performance Criteria
- [ ] Tempo de processamento reduzido em 30% para documentos comuns
- [ ] Memória utilizada reduzida em 40%
- [ ] Taxa de sucesso > 95% para todos os tipos de documento

### 4.3 Reliability Criteria
- [ ] Sistema continua funcionando mesmo com falhas de serviços externos
- [ ] Logs estruturados permitem debugging fácil
- [ ] Circuit breakers protegem contra cascading failures
- [ ] Validação rigorosa previne dados corrompidos

## 5. Out of Scope

### 5.1 Explicitly Excluded
- [ ] Alteração da estrutura do banco de dados
- [ ] Mudança de APIs externas (Firecrawl, Gemini, etc.)
- [ ] Alteração da interface do usuário
- [ ] Implementação de novos tipos de documento
- [ ] Otimização de queries do banco (foco na lógica de negócio)

### 5.2 Future Considerations
- [ ] Suporte a mais tipos de arquivo (CAD, imagens complexas)
- [ ] Processamento em paralelo massivo
- [ ] Cache distribuído para previews
- [ ] ML para classificação automática de documentos

## 6. Success Metrics

### 6.1 Quantitative Metrics
- **Stability**: 0 regressões de funcionalidade
- **Performance**: 30% melhoria no tempo de processamento
- **Reliability**: >95% taxa de sucesso para todos os tipos
- **Code Quality**: 0 duplicação de código de extração

### 6.2 Qualitative Metrics
- **Maintainability**: Código fácil de entender e modificar
- **Debuggability**: Logs estruturados facilitam troubleshooting
- **Testability**: Serviços isolados são fáceis de testar
- **Reliability**: Sistema robusto que não quebra com mudanças pequenas