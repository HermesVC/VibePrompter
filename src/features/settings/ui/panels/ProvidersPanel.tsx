import { useEffect, useState } from 'react';
import { PanelHead, useToast, useGlobalLoader } from '@shared/ui';
import { invokeCommand } from '@kernel/infrastructure/tauri';
import { errorMessage as errorMsg } from '@shared/lib/utils';
import {
  PRESETS,
  emptyDraft,
  type Connection,
  type ConnectionDraft,
} from './providers/connection';
import { ConnectionList } from './providers/ConnectionList';
import { ConnectionEditor } from './providers/ConnectionEditor';

/**
 * The "Providers" panel is a working connection manager. Each connection
 * stores enough to make real API calls: a label, the wire protocol
 * (`openai` covers OpenAI plus every compatible vendor — OpenRouter, Groq,
 * Mistral, DeepSeek, Together, Gemini-compat, Ollama, LM Studio, vLLM,
 * llama.cpp; `anthropic` is the native Messages API), a base URL, an API key,
 * and the default model identifier.
 *
 * This component is the stateful container: it owns the connection list,
 * the editor draft, and all backend calls. The list and editor views live in
 * `./providers/ConnectionList` and `./providers/ConnectionEditor`.
 */
export function ProvidersPanel() {
  const toast = useToast();
  const loader = useGlobalLoader();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Inline feedback for state directly tied to the form (Save / Test) — toasts
  // are reserved for transient app-level events (import/export, connection
  // works, etc.). Inline keeps Save context next to the editor.
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  // Connection editor's secondary fields (custom headers, notes) start
  // collapsed. They auto-expand when editing an existing connection that
  // already has values in them, so users with notes/headers see them
  // immediately rather than thinking the data is lost.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const reload = () =>
    invokeCommand<Connection[]>('list_connections')
      .then(setConnections)
      .catch(() => setConnections([]));

  useEffect(() => {
    reload();
  }, []);

  const isEditing = draft !== null;

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p || !draft) return;
    setDraft({
      ...draft,
      label: draft.label || p.label,
      kind: p.kind,
      baseUrl: p.baseUrl,
      defaultModel: draft.defaultModel || p.model,
    });
    setModels([]);
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setFeedback(null);
    loader.show('Saving connection...');
    try {
      await invokeCommand<Connection>('save_connection', { input: draft });
      await reload();
      setDraft(null);
      setFeedback({ kind: 'ok', msg: 'Saved.' });
    } catch (e) {
      setFeedback({ kind: 'err', msg: errorMsg(e) });
    } finally {
      setBusy(null);
      loader.hide();
    }
  };

  const remove = async (id: string) => {
    setBusy(`del:${id}`);
    try {
      await invokeCommand<void>('delete_connection', { id });
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} connection${selected.size === 1 ? '' : 's'}? Their API keys will be removed from the keyring too.`)) {
      return;
    }
    setBusy('bulk:del');
    try {
      // Serial — each deletion touches the keyring; running them in parallel
      // can race the platform credential store on some backends.
      for (const id of selected) {
        try {
          await invokeCommand<void>('delete_connection', { id });
        } catch (e) {
          toast.err(`Failed to delete ${id}: ${errorMsg(e)}`);
        }
      }
      setSelected(new Set());
      await reload();
      toast.ok('Selected connections deleted.');
    } finally {
      setBusy(null);
    }
  };

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) =>
      s.size === connections.length ? new Set() : new Set(connections.map((c) => c.id))
    );

  const test = async (id: string) => {
    setBusy(`test:${id}`);
    const label = connections.find((c) => c.id === id)?.label ?? 'Connection';
    loader.show(`Testing connection for ${label}...`);
    try {
      const r = await invokeCommand<{ model: string; latencyMs: number }>(
        'test_connection',
        { id }
      );
      toast.ok(`${r.model} · ${r.latencyMs}ms`, `${label} works`);
    } catch (e) {
      toast.err(errorMsg(e), `${label} failed`);
    } finally {
      setBusy(null);
      loader.hide();
    }
  };

  const setDefault = async (id: string) => {
    setBusy(`def:${id}`);
    try {
      await invokeCommand<void>('set_default_connection', { id });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const fetchModels = async () => {
    if (!draft) return;
    if (!draft.baseUrl.trim()) {
      setFeedback({ kind: 'err', msg: 'Set a base URL before fetching models.' });
      return;
    }
    // Editing an existing connection with no inline key re-uses the saved
    // keyring entry on the backend side, so we only require a key for
    // brand-new drafts.
    if (!draft.id && !draft.apiKey.trim() && !draft.baseUrl.includes('localhost')) {
      setFeedback({ kind: 'err', msg: 'Paste your API key first — the vendor needs it to list models.' });
      return;
    }
    setBusy('models');
    setFeedback(null);
    loader.show('Fetching models from provider...');
    try {
      // Pass the current draft directly so the user doesn't have to save
      // before browsing models. Backend builds an ephemeral connection,
      // makes the request, and discards. Nothing is persisted by this
      // call — Save still has to happen separately.
      const list = await invokeCommand<string[]>('list_models_for_draft', { input: draft });
      setModels(list);
      if (list.length === 0) {
        setFeedback({ kind: 'err', msg: 'Vendor returned no models.' });
      }
    } catch (e) {
      setFeedback({ kind: 'err', msg: errorMsg(e) });
    } finally {
      setBusy(null);
      loader.hide();
    }
  };

  const exportConnections = async () => {
    try {
      const payload = await invokeCommand<unknown>('export_connections');
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibeprompter-connections-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.ok('Exported connections (API keys excluded).', 'Export complete');
    } catch (e) {
      toast.err(errorMsg(e), 'Export failed');
    }
  };

  const importConnections = () => {
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json';
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const payload = JSON.parse(text);
        const overwrite = window.confirm(
          'Overwrite existing connections that have matching IDs? Cancel to skip duplicates.'
        );
        const count = await invokeCommand<number>('import_connections', {
          payload,
          overwrite,
        });
        await reload();
        toast.ok(
          `Imported ${count} connection${count === 1 ? '' : 's'}. Add API keys before use.`,
          'Import complete'
        );
      } catch (e) {
        toast.err(errorMsg(e), 'Import failed');
      }
    };
    file.click();
  };

  const beginEdit = (c: Connection) => {
    setDraft({
      id: c.id,
      label: c.label,
      kind: (c.kind as 'openai' | 'anthropic') ?? 'openai',
      baseUrl: c.baseUrl,
      apiKey: '', // empty means "preserve existing"
      defaultModel: c.defaultModel,
      isDefault: c.isDefault,
      extraHeaders: c.extraHeaders ?? '',
      notes: c.notes ?? '',
      tags: c.tags ?? '',
      priceInputPerM: c.priceInputPerM ?? 0,
      priceOutputPerM: c.priceOutputPerM ?? 0,
    });
    setModels([]);
    setKeyVisible(false);
    setFeedback(null);
    // Auto-open the Advanced section when editing a row that already has
    // headers, notes, or a pricing override — otherwise the user thinks
    // their data is missing.
    setAdvancedOpen(
      Boolean(
        c.extraHeaders?.trim() ||
          c.notes?.trim() ||
          (c.priceInputPerM ?? 0) > 0 ||
          (c.priceOutputPerM ?? 0) > 0
      )
    );
  };

  const beginAdd = () => {
    setDraft(emptyDraft());
    setKeyVisible(false);
    setFeedback(null);
    setAdvancedOpen(false); // new connection — clean state
  };

  return (
    <div className="flex flex-col gap-6">
      <PanelHead
        title="Provider connections"
        hint="Connect any OpenAI-compatible vendor or the native Anthropic API. Models are free-text — fetch them live from the vendor instead of waiting for an app update."
      />

      {feedback && (
        <div
          className="rounded-md px-3 py-2 text-[12.5px]"
          style={{
            background:
              feedback.kind === 'ok'
                ? 'rgba(52,211,153,0.08)'
                : 'rgba(248,113,113,0.10)',
            color: feedback.kind === 'ok' ? 'var(--ok)' : 'var(--danger)',
            border: `.5px solid ${
              feedback.kind === 'ok' ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.30)'
            }`,
          }}
        >
          {feedback.msg}
        </div>
      )}

      {!isEditing && (
        <ConnectionList
          connections={connections}
          selected={selected}
          tagFilter={tagFilter}
          busy={busy}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          onRemoveSelected={removeSelected}
          onSetTagFilter={setTagFilter}
          onTest={test}
          onSetDefault={setDefault}
          onEdit={beginEdit}
          onRemove={remove}
          onAdd={beginAdd}
          onImport={importConnections}
          onExport={exportConnections}
        />
      )}

      {isEditing && draft && (
        <ConnectionEditor
          draft={draft}
          setDraft={setDraft}
          models={models}
          busy={busy}
          keyVisible={keyVisible}
          setKeyVisible={setKeyVisible}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          onApplyPreset={applyPreset}
          onFetchModels={fetchModels}
          onSave={save}
        />
      )}
    </div>
  );
}
