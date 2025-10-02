import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

const hasMarkdownSyntax = (text: string): boolean => {
  const markdownPatterns = [
    /\*\*[^*]+\*\*/,        // Bold **text**
    /\*[^*]+\*/,            // Italic *text*
    /^#{1,6}\s/m,           // Headers # text
    /^\s*[-*+]\s/m,         // Lists
    /^\s*\d+\.\s/m,         // Numbered lists
    /\[([^\]]+)\]\(([^)]+)\)/, // Links
    /^>\s/m,                // Blockquotes
    /```[\s\S]*```/,        // Code blocks
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
};

export const MarkdownContent = memo(({ content, className, style }: MarkdownContentProps) => {
  const isMarkdown = hasMarkdownSyntax(content);

  if (!isMarkdown) {
    return (
      <p className={className} style={style}>
        {content}
      </p>
    );
  }

  return (
    <div className={className} style={style}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0" style={style}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0" style={style}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mb-2 mt-2 first:mt-0" style={style}>
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed" style={style}>
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1 ml-2" style={style}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1 ml-2" style={style}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed" style={style}>
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold" style={style}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic" style={style}>
              {children}
            </em>
          ),
          blockquote: ({ children }) => (
            <blockquote 
              className="border-l-2 pl-3 my-2 opacity-80"
              style={{ ...style, borderColor: style?.color || 'currentColor' }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code 
                  className="px-1.5 py-0.5 rounded text-xs font-mono bg-white/10"
                  style={style}
                >
                  {children}
                </code>
              );
            }
            return (
              <code 
                className="block p-2 rounded text-xs font-mono bg-white/10 overflow-x-auto"
                style={style}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition-opacity"
              style={style}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownContent.displayName = 'MarkdownContent';
