'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { DOCS, DocSection } from '@/lib/docs-content';
import { useTheme } from '@/components/ThemeProvider';
import styles from './docs.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function DocsPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    DOCS.forEach(d => d.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, []);

  const filtered = useMemo(() => {
    return DOCS.filter(d => {
      if (activeTag && !d.tags.includes(activeTag)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          d.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [search, activeTag]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to AI service.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  function renderContent(content: string) {
    // Simple markdown-like rendering
    return content.split('\n\n').map((para, i) => {
      if (para.startsWith('- ')) {
        const items = para.split('\n').filter(l => l.startsWith('- '));
        return (
          <ul key={i} className={styles.list}>
            {items.map((item, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item.slice(2)) }} />
            ))}
          </ul>
        );
      }
      if (para.match(/^\d+\./)) {
        const items = para.split('\n').filter(l => l.match(/^\d+\./));
        return (
          <ol key={i} className={styles.list}>
            {items.map((item, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item.replace(/^\d+\.\s*/, '')) }} />
            ))}
          </ol>
        );
      }
      return <p key={i} className={styles.paragraph} dangerouslySetInnerHTML={{ __html: formatInline(para) }} />;
    });
  }

  function formatInline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleBlock}>
            <Link href="/" className={styles.backLink}>Back to Sheriff Sale Viewer</Link>
            <h1 className={styles.title}>Documentation</h1>
            <p className={styles.subtitle}>Complete guide to using the Sheriff Sale Viewer</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.chatToggle} onClick={() => setChatOpen(!chatOpen)}>
              {chatOpen ? 'Close AI Assistant' : 'Ask AI'}
            </button>
            <Link href="/settings" className={styles.settingsLink}>Settings</Link>
            <button className={styles.themeBtn} onClick={toggleTheme}>
              {theme === 'dark' ? '\u2600' : '\u263E'}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search documentation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.tagList}>
            <button
              className={`${styles.tag} ${!activeTag ? styles.tagActive : ''}`}
              onClick={() => setActiveTag(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`${styles.tag} ${activeTag === tag ? styles.tagActive : ''}`}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <nav className={styles.tocList}>
            {filtered.map(d => (
              <a
                key={d.id}
                href={`#${d.id}`}
                className={styles.tocItem}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(d.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {d.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className={styles.content}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No documentation found matching your search.</div>
          )}
          {filtered.map(d => (
            <section key={d.id} id={d.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {d.title}
              </h2>
              <div className={styles.sectionTags}>
                {d.tags.map(t => (
                  <span
                    key={t}
                    className={`${styles.inlineTag} ${activeTag === t ? styles.inlineTagActive : ''}`}
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className={styles.sectionBody}>
                {renderContent(d.content)}
              </div>
            </section>
          ))}
        </div>

        {chatOpen && (
          <aside className={styles.chatPanel}>
            <div className={styles.chatHeader}>
              <span>AI Documentation Assistant</span>
              <button className={styles.chatClose} onClick={() => setChatOpen(false)}>x</button>
            </div>
            <div className={styles.chatMessages}>
              {chatMessages.length === 0 && (
                <div className={styles.chatEmpty}>
                  Ask any question about the Sheriff Sale Viewer. The AI has access to all documentation.
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`${styles.chatMsg} ${m.role === 'user' ? styles.chatMsgUser : styles.chatMsgAssistant}`}>
                  <div className={styles.chatMsgRole}>{m.role === 'user' ? 'You' : 'AI'}</div>
                  <div className={styles.chatMsgContent}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className={`${styles.chatMsg} ${styles.chatMsgAssistant}`}>
                  <div className={styles.chatMsgRole}>AI</div>
                  <div className={styles.chatMsgContent}>Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className={styles.chatForm} onSubmit={handleChatSubmit}>
              <input
                className={styles.chatInput}
                type="text"
                placeholder="Ask a question..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button className={styles.chatSend} type="submit" disabled={chatLoading || !chatInput.trim()}>
                Send
              </button>
            </form>
          </aside>
        )}
      </div>
    </main>
  );
}
