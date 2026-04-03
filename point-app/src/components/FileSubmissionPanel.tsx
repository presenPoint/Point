import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  extractMaterialFromFile,
  filterSupportedFiles,
  getMaterialFileKind,
  type MaterialFileKind,
} from '../lib/processMaterialFile';
import { useSessionStore } from '../store/sessionStore';

const MAX_FILES = 20;
const MAX_BYTES = 1024 * 1024 * 1024; // 1GB

type ViewMode = 'grid' | 'list' | 'folder';

type LocalFileEntry = {
  id: string;
  name: string;
  size: number;
  kind: MaterialFileKind;
  text: string;
  error?: string;
  loading?: boolean;
};

function truncateName(name: string, max = 14): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  const cut = Math.max(1, max - ext.length - 1);
  return `${base.slice(0, cut)}…${ext}`;
}

function combineMaterialText(items: LocalFileEntry[]): string {
  const ok = items.filter((e) => !e.error && !e.loading && e.text.trim().length > 0);
  return ok
    .map((e) => `<<< File: ${e.name} >>>\n\n${e.text.trim()}`)
    .join('\n\n---\n\n');
}

function FileKindIcon({ kind }: { kind: MaterialFileKind }) {
  const label =
    kind === 'pdf' ? 'PDF' : kind === 'pptx' ? 'PPT' : kind === 'md' ? 'MD' : 'TXT';
  const bg =
    kind === 'pdf'
      ? '#e53e3e'
      : kind === 'pptx'
        ? '#d97706'
        : kind === 'md'
          ? '#6366f1'
          : '#64748b';
  return (
    <div className="fs-file-icon" style={{ background: bg }} aria-hidden>
      <span className="fs-file-icon-label">{label}</span>
    </div>
  );
}

function IconAddFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconAddFolder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconDownloadTray() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="5" width="18" height="2" rx="1" />
      <rect x="3" y="11" width="18" height="2" rx="1" />
      <rect x="3" y="17" width="18" height="2" rx="1" />
    </svg>
  );
}

function IconFolderView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type Props = {
  globalBusy: boolean;
};

export function FileSubmissionPanel({ globalBusy }: Props) {
  const setMaterialText = useSessionStore((s) => s.setMaterialText);
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [dragOver, setDragOver] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const ingestFiles = useCallback(async (fileArray: File[]) => {
    const oversized = fileArray.filter((f) => f.size > MAX_BYTES);
    if (oversized.length) {
      useSessionStore.setState({
        error: 'Each file must be under 1GB.',
      });
      return;
    }

    const supported = filterSupportedFiles(fileArray);
    if (supported.length === 0) {
      useSessionStore.setState({
        error: 'Only supported formats (TXT, MD, PDF, PPTX) can be added.',
      });
      return;
    }

    const work: { batch: { id: string; file: File }[] | null } = { batch: null };

    flushSync(() => {
      setEntries((prev) => {
        const room = MAX_FILES - prev.length;
        if (room <= 0) {
          useSessionStore.setState({ error: `You can attach up to ${MAX_FILES} files.` });
          return prev;
        }
        const take = supported.slice(0, room);
        if (supported.length > room) {
          useSessionStore.setState({ error: `Only the first ${MAX_FILES} files were added.` });
        } else {
          useSessionStore.setState({ error: null });
        }

        if (work.batch === null) {
          work.batch = take.map((f) => ({ id: crypto.randomUUID(), file: f }));
        }
        const batch = work.batch;
        const placeholders: LocalFileEntry[] = batch.map((p) => ({
          id: p.id,
          name: p.file.name,
          size: p.file.size,
          kind: getMaterialFileKind(p.file.name)!,
          text: '',
          loading: true,
        }));
        if (placeholders.length > 0 && prev.some((e) => e.id === batch[0].id)) {
          return prev;
        }
        return [...prev, ...placeholders];
      });
    });

    const batchSlots = work.batch ?? [];
    if (batchSlots.length === 0) return;

    setPanelBusy(true);
    try {
      for (const p of batchSlots) {
        const result = await extractMaterialFromFile(p.file);
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== p.id) return e;
            if (result.ok) {
              return {
                ...e,
                text: result.text,
                kind: result.kind,
                loading: false,
                error: undefined,
              };
            }
            return {
              ...e,
              text: '',
              loading: false,
              error: result.message,
            };
          })
        );
      }
    } finally {
      setPanelBusy(false);
    }
  }, []);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) void ingestFiles(Array.from(list));
    e.target.value = '';
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSave = () => {
    const combined = combineMaterialText(entries);
    if (entries.some((e) => e.loading)) {
      useSessionStore.setState({
        error: 'Please wait until file text extraction is complete before saving.',
      });
      return;
    }
    if (combined.trim().length < 20) {
      useSessionStore.setState({
        error:
          'No text available to save. Please add files that were processed without errors and try again.',
      });
      return;
    }
    setMaterialText(combined);
    useSessionStore.setState({ error: null });
  };

  const handleCancel = () => {
    setEntries([]);
    setMaterialText('');
    useSessionStore.setState({ error: null });
  };

  const hasLoadingEntry = entries.some((e) => e.loading);
  const disabled = globalBusy || panelBusy || hasLoadingEntry;
  const bodyClass =
    dragOver ? 'fs-body fs-body-drop fs-body-dragover' : 'fs-body fs-body-drop';

  return (
    <div className="file-submit-panel">
      <div className="fs-header-row">
        <h3 className="fs-title">File Submission</h3>
        <p className="fs-limits">
          Max file size: 1GB, Max attachments: {MAX_FILES}
        </p>
      </div>

      <div className="fs-card">
        <div className="fs-toolbar">
          <div className="fs-toolbar-left">
            <button
              type="button"
              className="fs-tool-btn"
              title="Add files"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <IconAddFile />
            </button>
            <button
              type="button"
              className="fs-tool-btn"
              title="Add from folder"
              disabled={disabled}
              onClick={() => folderInputRef.current?.click()}
            >
              <IconAddFolder />
            </button>
            <button
              type="button"
              className="fs-tool-btn"
              title="Upload"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <IconDownloadTray />
            </button>
          </div>
          <div className="fs-toolbar-right">
            <button
              type="button"
              className={`fs-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              title="Grid view"
              onClick={() => setViewMode('grid')}
            >
              <IconGrid />
            </button>
            <button
              type="button"
              className={`fs-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              title="List view"
              onClick={() => setViewMode('list')}
            >
              <IconList />
            </button>
            <button
              type="button"
              className={`fs-view-btn ${viewMode === 'folder' ? 'active' : ''}`}
              title="Folder view"
              onClick={() => setViewMode('folder')}
            >
              <IconFolderView />
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf,.pptx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="fs-hidden-input"
          onChange={onPickFiles}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="fs-hidden-input"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={onPickFiles}
        />

        <div
          className={bodyClass}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            const dropped = Array.from(e.dataTransfer.files);
            void ingestFiles(dropped);
          }}
        >
          {entries.length === 0 ? (
            <div className="fs-empty-hint">
              {panelBusy ? 'Processing files…' : 'Drag files here or add them using the toolbar above.'}
            </div>
          ) : viewMode === 'list' ? (
            <ul className="fs-list">
              {entries.map((e) => (
                <li key={e.id} className="fs-list-row">
                  <FileKindIcon kind={e.kind} />
                  <div className="fs-list-meta">
                    <span className="fs-list-name">{e.name}</span>
                    <span className="fs-list-sub">
                      {(e.size / 1024).toFixed(1)} KB
                      {e.loading ? ' · Processing…' : ''}
                      {e.error ? ` · ${e.error}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="fs-remove"
                    aria-label="Remove"
                    disabled={disabled}
                    onClick={() => removeEntry(e.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={viewMode === 'folder' ? 'fs-grid fs-grid-folder' : 'fs-grid'}>
              {entries.map((e) => (
                <div key={e.id} className="fs-grid-item">
                  <button
                    type="button"
                    className="fs-remove fs-remove-float"
                    aria-label="Remove"
                    disabled={disabled}
                    onClick={() => removeEntry(e.id)}
                  >
                    ×
                  </button>
                  <FileKindIcon kind={e.kind} />
                  <div className="fs-grid-name" title={e.name}>
                    {truncateName(e.name, 16)}
                  </div>
                  {e.loading && <div className="fs-grid-status">Processing…</div>}
                  {e.error && <div className="fs-grid-err">{truncateName(e.error, 24)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fs-footer">
        <button
          type="button"
          className="fs-btn-save"
          disabled={disabled || entries.length === 0}
          onClick={handleSave}
        >
          Save
        </button>
        <button
          type="button"
          className="fs-btn-cancel"
          disabled={globalBusy}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
