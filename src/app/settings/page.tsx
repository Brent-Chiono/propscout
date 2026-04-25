'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import styles from './settings.module.css';

interface ProviderConfig {
  provider: string;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  hasKey?: boolean;
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { provider: 'anthropic', label: 'Anthropic (Claude)', apiKey: '', model: 'claude-sonnet-4-20250514', enabled: false },
  { provider: 'ollama', label: 'Ollama (Local)', apiKey: 'not-needed', model: 'llama3.2', baseUrl: 'http://localhost:11434', enabled: false },
  { provider: 'gemini', label: 'Google Gemini', apiKey: '', model: 'gemini-2.0-flash', enabled: false },
  { provider: 'custom', label: 'Custom (OpenAI-compatible)', apiKey: '', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', enabled: false },
];

interface OllamaModel {
  name: string;
  size: number | null;
  parameters: string | null;
}

export default function SettingsPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);

  useEffect(() => {
    fetch('/api/ai-settings')
      .then(r => r.json())
      .then(data => {
        if (data.providers?.length) {
          // Merge server data with defaults (keep defaults for any missing providers)
          const merged = DEFAULT_PROVIDERS.map(def => {
            const saved = data.providers.find((p: ProviderConfig) => p.provider === def.provider);
            return saved ? { ...def, ...saved } : def;
          });
          setProviders(merged);
        }
      })
      .catch(() => {});
  }, []);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const providersRef = useRef(providers);
  useEffect(() => { providersRef.current = providers; }, [providers]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      const error = await saveProviders(providersRef.current);
      setStatus(error ? `Error: ${error}` : 'Saved');
      setSaving(false);
      // Clear "Saved" message after 2s
      setTimeout(() => setStatus(prev => prev === 'Saved' ? null : prev), 2000);
    }, 800);
  }, []);

  function updateProvider(index: number, updates: Partial<ProviderConfig>) {
    const updated = providers.map((p, i) => i === index ? { ...p, ...updates } : p);
    setProviders(updated);
    debouncedSave();
  }

  async function fetchOllamaModels(baseUrl: string) {
    setOllamaLoading(true);
    setOllamaModels([]);
    setStatus(null);
    try {
      const res = await fetch(`/api/ollama-models?baseUrl=${encodeURIComponent(baseUrl)}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Ollama: ${data.error || 'Connection failed'}`);
        return;
      }
      if (data.models?.length) {
        setOllamaModels(data.models);
        setStatus(`Found ${data.models.length} model(s) on Ollama server`);
        // Auto-select first model if current one isn't in the list
        setProviders(prev => {
          const idx = prev.findIndex(p => p.provider === 'ollama');
          if (idx < 0) return prev;
          const current = prev[idx].model;
          const inList = data.models.some((m: OllamaModel) => m.name === current);
          if (inList) return prev;
          return prev.map((p, i) => i === idx ? { ...p, model: data.models[0].name } : p);
        });
      } else {
        setStatus(data.error ? `Ollama: ${data.error}` : 'No models found on Ollama server');
      }
    } catch {
      setStatus('Failed to connect to Ollama server');
    } finally {
      setOllamaLoading(false);
    }
  }

  function handleEnable(index: number) {
    const updated = providers.map((p, i) => ({ ...p, enabled: i === index ? !p.enabled : false }));
    setProviders(updated);
    // Save immediately for enable/disable (no debounce)
    providersRef.current = updated;
    saveProviders(updated).then(err => {
      if (err) setStatus(`Error: ${err}`);
    });
  }

  async function saveProviders(providersToSave: ProviderConfig[]) {
    try {
      const res = await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providers: providersToSave }),
      });
      const data = await res.json();
      return data.ok ? null : (data.error || 'Save failed');
    } catch (err: any) {
      return err.message;
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const error = await saveProviders(providers);
    setStatus(error ? `Error: ${error}` : 'Settings saved. API keys are encrypted on disk.');
    setSaving(false);
  }

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest(provider: ProviderConfig) {
    setTesting(provider.provider);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Say "Connection successful!" in exactly those words.' }),
      });
      const data = await res.json();
      if (data.error) {
        setTestResult({ ok: false, message: data.error });
      } else {
        setTestResult({ ok: true, message: `Response from ${data.provider}: "${data.response.slice(0, 120)}"` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(null);
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <Link href="/" className={styles.backLink}>Back to Sheriff Sale Viewer</Link>
            <h1 className={styles.title}>Settings</h1>
          </div>
          <div className={styles.headerActions}>
            <Link href="/docs" className={styles.docsLink}>Documentation</Link>
            <button className={styles.themeBtn} onClick={toggleTheme}>
              {theme === 'dark' ? '\u2600' : '\u263E'}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>AI Provider Configuration</h2>
          <p className={styles.cardDesc}>
            Configure an AI provider to enable the documentation Q&A assistant. API keys are encrypted with AES-256-GCM before storage. Only one provider can be active at a time.
          </p>

          <div className={styles.providerList}>
            {providers.map((p, i) => (
              <div key={p.provider} className={`${styles.provider} ${p.enabled ? styles.providerActive : ''}`}>
                <div className={styles.providerHeader}>
                  <div className={styles.providerInfo}>
                    <span className={styles.providerLabel}>{p.label}</span>
                    {p.hasKey && <span className={styles.hasKeyBadge}>Key saved</span>}
                  </div>
                  <button
                    className={`${styles.enableBtn} ${p.enabled ? styles.enableBtnActive : ''}`}
                    onClick={() => handleEnable(i)}
                  >
                    {p.enabled ? 'Active' : 'Enable'}
                  </button>
                </div>

                <div className={styles.providerFields}>
                  {p.provider !== 'ollama' && (
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>API Key</label>
                      <input
                        className={styles.fieldInput}
                        type="password"
                        placeholder={p.hasKey ? 'Key saved (enter new to replace)' : 'Enter API key...'}
                        value={p.apiKey}
                        onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                      />
                    </div>
                  )}

                  {(p.provider === 'ollama' || p.provider === 'custom') && (
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Base URL</label>
                      <div className={styles.fieldRow}>
                        <input
                          className={styles.fieldInput}
                          type="text"
                          placeholder="http://localhost:11434"
                          value={p.baseUrl || ''}
                          onChange={(e) => updateProvider(i, { baseUrl: e.target.value })}
                        />
                        {p.provider === 'ollama' && (
                          <button
                            className={styles.fetchBtn}
                            onClick={() => fetchOllamaModels(p.baseUrl || 'http://localhost:11434')}
                            disabled={ollamaLoading}
                          >
                            {ollamaLoading ? 'Loading...' : 'Fetch Models'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Model</label>
                    {p.provider === 'ollama' && ollamaModels.length > 0 ? (
                      <select
                        className={styles.fieldSelect}
                        value={p.model}
                        onChange={(e) => updateProvider(i, { model: e.target.value })}
                      >
                        {ollamaModels.map(m => (
                          <option key={m.name} value={m.name}>
                            {m.name} {m.size ? `(${m.size}GB)` : ''} {m.parameters ? `- ${m.parameters}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={styles.fieldInput}
                        type="text"
                        placeholder={p.provider === 'ollama' ? 'Click "Fetch Models" to load list' : 'Model name'}
                        value={p.model}
                        onChange={(e) => updateProvider(i, { model: e.target.value })}
                      />
                    )}
                  </div>
                </div>

                {p.enabled && (
                  <div className={styles.testRow}>
                    <button
                      className={styles.testBtn}
                      onClick={() => handleTest(p)}
                      disabled={testing === p.provider}
                    >
                      {testing === p.provider ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResult && !testing && (
                      <span className={`${styles.testResult} ${testResult.ok ? styles.testResultOk : styles.testResultError}`}>
                        {testResult.ok ? '\u2713' : '\u2717'} {testResult.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {status && (
            <div className={styles.actions}>
              <span className={`${styles.status} ${status.startsWith('Error') || status.startsWith('Test failed') ? styles.statusError : styles.statusOk}`}>
                {saving ? 'Saving...' : status}
              </span>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Rentcast API Key</h2>
          <p className={styles.cardDesc}>
            Rentcast provides property-specific rent and value estimates with comparable properties.
            Get a free API key (50 calls/month) at <a href="https://app.rentcast.io/app/api" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>app.rentcast.io</a>.
            Data is cached for 30 days per property.
          </p>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>API Key</label>
            <input
              className={styles.fieldInput}
              type="password"
              placeholder="Add RENTCAST_API_KEY to .env.local or enter here"
              defaultValue=""
              onBlur={(e) => {
                if (!e.target.value) return;
                // Save to env-style by writing to ai-settings as a special provider
                const updated = [...providers.filter(p => p.provider !== 'rentcast'), {
                  provider: 'rentcast', label: 'Rentcast', apiKey: e.target.value,
                  model: '', enabled: true,
                }];
                saveProviders(updated);
                setStatus('Rentcast API key saved');
              }}
            />
          </div>
          <p className={styles.cardDesc} style={{ marginTop: 8 }}>
            Or add <code>RENTCAST_API_KEY=your-key</code> to your <code>.env.local</code> file.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Environment Setup</h2>
          <p className={styles.cardDesc}>
            Add the following to your <code>.env.local</code> file to enable encrypted settings storage:
          </p>
          <pre className={styles.codeBlock}>
            SETTINGS_ENCRYPTION_KEY=your-secret-key-here
          </pre>
          <p className={styles.cardDesc} style={{ marginTop: 12 }}>
            This key is used to encrypt/decrypt API keys stored in <code>data/ai-settings.json</code>.
            Choose a strong, random string. If you change this key, you&apos;ll need to re-enter all API keys.
          </p>
        </div>
      </div>
    </main>
  );
}
