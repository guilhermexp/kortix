# Image Gallery Feature

## Descrição
Nova funcionalidade que exibe imagens extraídas de URLs na seção "Summary" do resumo executivo dos documentos.

## Arquivos Modificados/Criados

### Novo Arquivo
- `components/memories/image-gallery.tsx` - Componente principal da galeria de imagens

### Modificações
- `components/memories/memory-detail.tsx` - Adicionado import e uso do ImageGallery na seção Summary

## Como Funciona

### Extração de Imagens
O sistema extrai imagens de diversas fontes nos metadados do documento:
- **Imagem Principal**: og:image, previewImage, preview_image, thumbnail, etc.
- **Imagens Adicionais**: Arrays de imagens encontrados nos dados brutos (firecrawl, extraction, etc.)
- **Limite**: Máximo de 4 imagens para um layout 2x2 limpo e organizado

### Layout e Design
- **Grid 2x2**: Layout fixo de 2 colunas para máximo 4 imagens
- **Aspect Ratio**: 4:3 para todas as imagens mantendo consistência visual
- **Hover Effects**: Escala suave e overlay com botão de link externo
- **Glass Effect**: Estilo consistente com o resto da interface (blur, bordas translúcidas)

### Funcionalidades
1. **Visualização em Grid**: Imagens organizadas em layout responsivo
2. **Modal de Preview**: Click na imagem abre modal para visualização ampliada
3. **Link Externo**: Botão para abrir imagem original em nova aba
4. **Error Handling**: Imagens que falham ao carregar são removidas automaticamente
5. **Loading Lazy**: Imagens carregam sob demanda para performance

### Estilos Visuais
- **Gradiente de Fundo**: Cores escuras consistentes com o tema
- **Badges**: Identificação do tipo de imagem (Main Preview, Additional Image)
- **Bordas**: Transparências e blur effects seguindo o design system
- **Animações**: Transições suaves para hover e modal

## Localização da Funcionalidade

A galeria de imagens aparece na seção "Summary" do painel lateral direito quando você:
1. Clica em um documento que contém URL
2. Seleciona a aba "Summary" 
3. As imagens aparecem abaixo do texto do resumo executivo

## Dados de Origem

As imagens são extraídas dos seguintes campos nos metadados do documento:
- `metadata.ogImage`, `metadata.previewImage`, etc.
- `raw.extraction.images[]`
- `raw.firecrawl.images[]` 
- `raw.firecrawl.metadata.ogImage`

## Performance

- **Lazy Loading**: Imagens carregam apenas quando visíveis
- **Limite de Imagens**: Máximo 4 imagens para evitar sobrecarga e manter interface limpa
- **Error Recovery**: URLs inválidas são filtradas automaticamente
- **Memory Management**: Estado local gerenciado com hooks otimizados

## Responsividade

- **Todas as telas**: Grid de 2 colunas (layout 2x2 consistente)
- **Modal**: Adapta-se a qualquer tamanho de tela

Esta implementação segue o padrão visual e de UX já estabelecido no SuperMemory, integrando-se perfeitamente com o design system existente.