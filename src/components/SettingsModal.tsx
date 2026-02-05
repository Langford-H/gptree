import React, { useEffect, useState } from "react";
import { BranchSeed, WorkspaceSettings } from "../models/types";

interface SettingsModalProps {
  isOpen: boolean;
  settings: WorkspaceSettings;
  branchSeeds: Array<{ sessionId: string; seed: BranchSeed }>;
  onClose: () => void;
  onSave: (settings: WorkspaceSettings) => void;
  onReset: () => void;
  onTest: (settings: WorkspaceSettings) => Promise<string>;
  onExport: () => string;
  onImport: (raw: string) => { ok: boolean; error?: string };
}

export default function SettingsModal({
  isOpen,
  settings,
  branchSeeds,
  onClose,
  onSave,
  onReset,
  onTest,
  onExport,
  onImport,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
      setTestStatus(null);
      setExportText("");
      setImportText("");
      setImportStatus(null);
      return;
    }
    setSaveStatus(null);
  }, [isOpen, settings]);

  if (!isOpen) {
    return null;
  }

  const update = (patch: Partial<WorkspaceSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateProviderConfig = (patch: Partial<WorkspaceSettings["providerConfig"]>) => {
    setDraft((current) => ({
      ...current,
      providerConfig: { ...current.providerConfig, ...patch },
    }));
  };

  const handleSave = () => {
    onSave(draft);
    setSaveStatus("Settings saved.");
  };

  const handleTest = async () => {
    setTestStatus("Testing connection...");
    try {
      const message = await onTest(draft);
      setTestStatus(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestStatus(`Error: ${message}`);
    }
  };

  const handleExport = () => {
    setExportText(onExport());
  };

  const handleImport = () => {
    const result = onImport(importText);
    if (result.ok) {
      setImportStatus("Import complete.");
    } else {
      setImportStatus(result.error ?? "Import failed.");
    }
  };

  return (
    <div className="settings-modal" role="dialog" aria-modal="true">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <div className="settings-header-actions">
            <button className="button-secondary" type="button" onClick={onReset}>
              Reset Settings
            </button>
            <button className="button-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="settings-row">
          <label>Root Seed</label>
          <textarea
            value={draft.rootSeed}
            onChange={(event) => update({ rootSeed: event.target.value })}
            rows={5}
          />
        </div>

        <div className="settings-row">
          <label>Branch Seeds</label>
          <div className="settings-branch-seeds">
            {branchSeeds.length > 0 ? (
              branchSeeds.map(({ sessionId, seed }) => (
                <div className="settings-branch-seed" key={sessionId}>
                  <div className="seed-row">
                    <span className="seed-label">sessionId</span>
                    <span className="seed-value">{sessionId}</span>
                  </div>
                  <div className="seed-row">
                    <span className="seed-label">sourceTreeId</span>
                    <span className="seed-value">{seed.sourceTreeId}</span>
                  </div>
                  <div className="seed-row">
                    <span className="seed-label">sourceSessionId</span>
                    <span className="seed-value">{seed.sourceSessionId}</span>
                  </div>
                  <div className="seed-row">
                    <span className="seed-label">sourceNodeId</span>
                    <span className="seed-value">{seed.sourceNodeId}</span>
                  </div>
                  <div className="seed-row">
                    <span className="seed-label">createdAt</span>
                    <span className="seed-value">
                      {new Date(seed.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="seed-row seed-block">
                    <span className="seed-label">quoteText</span>
                    <pre className="seed-pre">{seed.quoteText}</pre>
                  </div>
                  <div className="seed-row seed-block">
                    <span className="seed-label">originSummary</span>
                    <pre className="seed-pre">{seed.originSummary}</pre>
                  </div>
                </div>
              ))
            ) : (
              <div className="seed-empty">No branch seeds available.</div>
            )}
          </div>
        </div>

        <div className="settings-row">
          <label>Provider Mode</label>
          <select
            value={draft.providerMode}
            onChange={(event) =>
              update({
                providerMode: event.target.value === "external" ? "external" : "dummy",
              })
            }
          >
            <option value="dummy">Dummy</option>
            <option value="external">External</option>
          </select>
        </div>

        <div className="settings-row">
          <label>Base URL</label>
          <input
            value={draft.providerConfig.baseUrl ?? ""}
            onChange={(event) => updateProviderConfig({ baseUrl: event.target.value })}
          />
        </div>

        <div className="settings-row">
          <label>API Key</label>
          <input
            type="password"
            value={draft.providerConfig.apiKey ?? ""}
            onChange={(event) => updateProviderConfig({ apiKey: event.target.value })}
          />
        </div>

        <div className="settings-row">
          <label>Model</label>
          <input
            value={draft.providerConfig.model ?? ""}
            onChange={(event) => updateProviderConfig({ model: event.target.value })}
          />
        </div>

        <div className="settings-row">
          <label>Stream</label>
          <select
            value={draft.providerConfig.stream ? "true" : "false"}
            onChange={(event) =>
              updateProviderConfig({ stream: event.target.value === "true" })
            }
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>

        <div className="settings-row">
          <label>Max Tokens</label>
          <input
            type="number"
            value={draft.providerConfig.maxTokens ?? 0}
            onChange={(event) =>
              updateProviderConfig({ maxTokens: Number(event.target.value) || 0 })
            }
          />
        </div>

        <div className="settings-row">
          <label>Temperature</label>
          <input
            type="number"
            step="0.1"
            value={draft.providerConfig.temperature ?? ""}
            onChange={(event) =>
              updateProviderConfig({
                temperature:
                  event.target.value === "" ? undefined : Number(event.target.value),
              })
            }
          />
        </div>

        <div className="settings-row">
          <label>Base Font Size</label>
          <input
            type="number"
            value={draft.uiTheme.baseFontSize}
            onChange={(event) =>
              update({
                uiTheme: {
                  ...draft.uiTheme,
                  baseFontSize: Math.max(Number(event.target.value) || 12, 12),
                },
              })
            }
          />
        </div>

        <div className="settings-row">
          <label>Palette</label>
          <input
            value={draft.uiTheme.palette.join(", ")}
            onChange={(event) =>
              update({
                uiTheme: {
                  ...draft.uiTheme,
                  palette: event.target.value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </div>

        <div className="settings-actions">
          <button className="button-primary" type="button" onClick={handleSave}>
            Save
          </button>
          <button className="button-secondary" type="button" onClick={handleTest}>
            Test Connection
          </button>
        </div>

        <div className="export-box">
          <div className="export-header">
            <h3>Export / Import</h3>
            <p>API keys are never exported.</p>
          </div>
          {exportText ? <textarea readOnly value={exportText} rows={6} /> : null}
          <textarea
            placeholder="Paste JSON to import"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={6}
          />
          <div className="settings-actions export-actions">
            <button className="button-secondary" type="button" onClick={handleExport}>
              Export JSON
            </button>
            <button className="button-secondary" type="button" onClick={handleImport}>
              Import JSON
            </button>
            {importStatus ? <div className="status-text">{importStatus}</div> : null}
          </div>
        </div>
        <div className="settings-footer-status">
          {testStatus ? <div className="status-text">{testStatus}</div> : null}
          {saveStatus ? <div className="status-text">{saveStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}
