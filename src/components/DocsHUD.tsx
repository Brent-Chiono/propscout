'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { DOCS, DocSection } from '@/lib/docs-content';
import styles from './DocsHUD.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  context?: 'auctions' | 'taxsales';
}

export default function DocsHUD({ open, onClose, context }: Props) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tab, setTab] = useState<'docs' | 'ai'>('docs');
  const [docsTab, setDocsTab] = useState<'auctions' | 'taxsales'>(context || 'auctions');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const tabDocs = useMemo(() => {
    return DOCS.filter(d => d.category === docsTab || d.category === 'both');
  }, [docsTab]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tabDocs.forEach(d => d.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [tabDocs]);

  const filtered = useMemo(() => {
    return tabDocs.filter(d => {
      if (activeTag && !d.tags.includes(activeTag)) return false;
      if (search) {
        const q = search.toLowerCase();
        return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q) || d.tags.some(t => t.includes(q));
      }
      return true;
    });
  }, [tabDocs, search, activeTag]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (open && tab === 'docs') {
      setTimeout(() => searchRef.current?.focus(), 200);
    }
    if (open && context) setDocsTab(context);
  }, [open, tab, context]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: msg, context: docsTab }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.error ? `Error: ${data.error}` : data.response,
      }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to AI.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  function formatContent(content: string) {
    return content.split('\n\n').map((para, i) => {
      if (para.startsWith('- ') || para.startsWith('* ')) {
        const items = para.split('\n').filter(l => l.match(/^[-*] /));
        return <ul key={i} className={styles.list}>{items.map((item, j) =>
          <li key={j} dangerouslySetInnerHTML={{ __html: inline(item.slice(2)) }} />
        )}</ul>;
      }
      if (para.match(/^\d+\./)) {
        const items = para.split('\n').filter(l => l.match(/^\d+\./));
        return <ol key={i} className={styles.list}>{items.map((item, j) =>
          <li key={j} dangerouslySetInnerHTML={{ __html: inline(item.replace(/^\d+\.\s*/, '')) }} />
        )}</ol>;
      }
      return <p key={i} className={styles.para} dangerouslySetInnerHTML={{ __html: inline(para) }} />;
    });
  }

  function inline(t: string) {
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'docs' ? styles.tabActive : ''}`} onClick={() => setTab('docs')}>
              Docs
            </button>
            <button className={`${styles.tab} ${tab === 'ai' ? styles.tabActive : ''}`} onClick={() => setTab('ai')}>
              AI Doc Assistant
            </button>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>ESC</button>
        </div>

        {/* DOCS TAB */}
        {tab === 'docs' && (
          <div className={styles.docsBody}>
            <div className={styles.docsTabBar}>
              <button
                className={`${styles.docsTabBtn} ${docsTab === 'auctions' ? styles.docsTabBtnActive : ''}`}
                onClick={() => { setDocsTab('auctions'); setActiveTag(null); setChatMessages([]); }}
              >Sheriff Auctions</button>
              <button
                className={`${styles.docsTabBtn} ${docsTab === 'taxsales' ? styles.docsTabBtnActive : ''}`}
                onClick={() => { setDocsTab('taxsales'); setActiveTag(null); setChatMessages([]); }}
              >Tax Sales</button>
            </div>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search documentation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className={styles.tagBar}>
              <button
                className={`${styles.tag} ${!activeTag ? styles.tagActive : ''}`}
                onClick={() => setActiveTag(null)}
              >all</button>
              {allTags.map(t => (
                <button
                  key={t}
                  className={`${styles.tag} ${activeTag === t ? styles.tagActive : ''}`}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                >{t}</button>
              ))}
            </div>
            <div className={styles.docsScroll}>
              {filtered.length === 0 && <div className={styles.empty}>No results</div>}
              {filtered.map(d => (
                <div key={d.id} className={styles.docSection}>
                  <h3 className={styles.docTitle}>{d.title}</h3>
                  <div className={styles.docTags}>
                    {d.tags.map(t => (
                      <span key={t} className={styles.docTag} onClick={() => setActiveTag(t)}>{t}</span>
                    ))}
                  </div>
                  <div className={styles.docContent}>{formatContent(d.content)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI TAB */}
        {tab === 'ai' && (
          <div className={styles.aiBody}>
            <div className={styles.aiContext}>
              Context: <strong>{docsTab === 'taxsales' ? 'Tax Sales' : 'Sheriff Auctions'}</strong> documentation only
            </div>
            <div className={styles.chatScroll}>
              {chatMessages.length === 0 && (
                <div className={styles.chatEmpty}>
                  Ask anything about {docsTab === 'taxsales' ? 'tax sale certificates, bidding, redemption, and due diligence' : 'sheriff auctions, foreclosures, and property analysis'}.
                  The AI has context of {docsTab === 'taxsales' ? 'Tax Sales' : 'Sheriff Auctions'} docs only.
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`${styles.chatMsg} ${m.role === 'user' ? styles.chatUser : styles.chatAssistant}`}>
                  <span className={styles.chatRole}>{m.role === 'user' ? 'You' : 'AI'}</span>
                  <div className={styles.chatText}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className={`${styles.chatMsg} ${styles.chatAssistant}`}>
                  <span className={styles.chatRole}>AI</span>
                  <div className={styles.chatText}>Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className={styles.chatForm} onSubmit={handleChatSubmit}>
              <input
                className={styles.chatInput}
                placeholder="Ask a question..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button className={styles.chatSend} type="submit" disabled={chatLoading || !chatInput.trim()}>
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
