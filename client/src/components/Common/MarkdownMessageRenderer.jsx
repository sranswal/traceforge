import React, { useState } from 'react';
import { Copy, Check, Terminal, AlertTriangle } from 'lucide-react';
import { safeDecodeHtmlEntities } from '../../utils/markdownUtils.js';

export { safeDecodeHtmlEntities };

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg overflow-hidden border border-slate-700/60 bg-[#0d1117] text-slate-200 text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-700/50 text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-400 font-semibold lowercase">
          <Terminal className="w-3 h-3" />
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="hover:text-white transition-colors flex items-center gap-1 text-[10px]"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto font-mono text-[11px] leading-relaxed select-text">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

function renderInline(rawText) {
  if (!rawText) return null;
  const decoded = safeDecodeHtmlEntities(rawText);
  // Split on inline code (`...`) and bold (**...**)
  const parts = decoded.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#151c2c] text-violet-700 dark:text-cyan-400 border border-slate-200 dark:border-[#1f2a3f] mx-0.5 break-all inline"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MarkdownMessageRenderer({ content, className = '' }) {
  if (!content) return null;

  // 1. First normalize HTML entities safely
  const normalized = safeDecodeHtmlEntities(content);

  // 2. Parse into blocks (fenced code blocks, headings, lists, paragraphs)
  const lines = normalized.split('\n');
  const blocks = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        blocks.push({
          type: 'code',
          language: codeBlockLang,
          code: codeBlockLines.join('\n')
        });
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: trimmed.slice(5) });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3) });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2) });
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s+(.*)$/);
      blocks.push({ type: 'ol', number: match[1], text: match[2] });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'ul', text: trimmed.slice(2) });
    } else if (!trimmed) {
      blocks.push({ type: 'space' });
    } else {
      blocks.push({ type: 'p', text: trimmed });
    }
  }

  // Handle unclosed code block if any
  if (inCodeBlock) {
    blocks.push({
      type: 'code',
      language: codeBlockLang,
      code: codeBlockLines.join('\n')
    });
  }

  return (
    <div className={`space-y-2 text-xs leading-relaxed break-words max-w-full overflow-hidden ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return <CodeBlock key={idx} language={block.language} code={block.code} />;
        }
        if (block.type === 'h1' || block.type === 'h2') {
          return (
            <h3
              key={idx}
              className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-3 pb-1 border-b border-slate-200 dark:border-[#1f2a3f]"
            >
              {renderInline(block.text)}
            </h3>
          );
        }
        if (block.type === 'h3') {
          return (
            <h4
              key={idx}
              className="text-xs font-semibold text-slate-900 dark:text-slate-100 pt-2 pb-0.5 border-b border-slate-100 dark:border-[#1f2a3f]"
            >
              {renderInline(block.text)}
            </h4>
          );
        }
        if (block.type === 'h4') {
          return (
            <h5
              key={idx}
              className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide pt-1"
            >
              {renderInline(block.text)}
            </h5>
          );
        }
        if (block.type === 'ul') {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-violet-500 dark:text-cyan-400 font-bold mt-0.5">•</span>
              <div className="flex-1 min-w-0">{renderInline(block.text)}</div>
            </div>
          );
        }
        if (block.type === 'ol') {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="font-mono text-[10px] font-bold text-violet-600 dark:text-cyan-400 mt-0.5 shrink-0">
                {block.number}.
              </span>
              <div className="flex-1 min-w-0">{renderInline(block.text)}</div>
            </div>
          );
        }
        if (block.type === 'space') {
          return <div key={idx} className="h-0.5" />;
        }

        // Detect provider configuration / connection notices to style actionably
        if (block.text.includes('provider is not configured') || block.text.includes('provider error') || block.text.includes('credentials')) {
          return (
            <div
              key={idx}
              className="p-3 my-1.5 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">{renderInline(block.text)}</div>
            </div>
          );
        }

        return (
          <p key={idx} className="text-slate-800 dark:text-slate-200">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
