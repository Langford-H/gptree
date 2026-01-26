import React, { useEffect, useState } from "react";
import { WorkspaceSettings } from "../models/types";

interface SettingsModalProps {
  isOpen: boolean;
  settings: WorkspaceSettings;
  onClose: () => void;
  onSave: (settings: WorkspaceSettings) => void;
  onTest: (settings: WorkspaceSettings) => Promise<string>;
  onExport: () => string;
  onImport: (raw: string) => { ok: boolean; error?: string };
}

export default function SettingsModal({
  isOpen,
  settings,
  onClose,
  onSave,
  onTest,
  onExport,
  onImport,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
      setTestStatus(null);
      setExportText("");
      setImportText("");
      setImportStatus(null);
    }
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

  const updateSummarization = (
    patch: Partial<WorkspaceSettings["summarizationPolicy"]>
  ) => {
    setDraft((current) => ({
      ...current,
      summarizationPolicy: { ...current.summarizationPolicy, ...patch },
    }));
  };

  const handleSave = () => {
    onSave(draft);
    setTestStatus("Settings saved.");
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
          <button className="button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="settings-row">
          <label>System Prompt</label>
          <textarea
            value={draft.systemPrompt}
            onChange={(event) => update({ systemPrompt: event.target.value })}
            rows={4}
          />
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
          <label>Context Nodes</label>
          <input
            type="number"
            value={draft.summarizationPolicy.maxContextNodes}
            onChange={(event) =>
              updateSummarization({
                maxContextNodes: Math.max(Number(event.target.value) || 0, 0),
              })
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

        <div className="settings-actions">
          <button className="button-primary" type="button" onClick={handleSave}>
            Save
          </button>
          <button className="button-secondary" type="button" onClick={handleTest}>
            Test Connection
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => updateProviderConfig({ apiKey: "" })}
          >
            Forget Key
          </button>
          {testStatus ? <div className="status-text">{testStatus}</div> : null}
        </div>

        <div className="export-box">
          <div className="export-header">
            <h3>Export / Import</h3>
            <p>API keys are never exported.</p>
          </div>
          <button className="button-secondary" type="button" onClick={handleExport}>
            Export JSON
          </button>
          {exportText ? <textarea readOnly value={exportText} rows={6} /> : null}
          <textarea
            placeholder="Paste JSON to import"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={6}
          />
          <div className="settings-actions">
            <button className="button-secondary" type="button" onClick={handleImport}>
              Import JSON
            </button>
            {importStatus ? <div className="status-text">{importStatus}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
