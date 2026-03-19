import React, { useEffect, useState } from "react";
import { WorkspaceSettings } from "../models/types";

interface SettingsModalProps {
  isOpen: boolean;
  settings: WorkspaceSettings;
  onClose: () => void;
  onSave: (settings: WorkspaceSettings) => void;
  onReset: () => void;
  onClearAll: () => void;
  onTest: (settings: WorkspaceSettings) => Promise<string>;
}

export default function SettingsModal({
  isOpen,
  settings,
  onClose,
  onSave,
  onReset,
  onClearAll,
  onTest,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
      setTestStatus(null);
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
          <label>Show Context Preview</label>
          <select
            value={draft.showContextPreview ? "true" : "false"}
            onChange={(event) =>
              update({ showContextPreview: event.target.value === "true" })
            }
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
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
          <label>Base URL</label>
          <input
            value={draft.providerConfig.baseUrl ?? ""}
            onChange={(event) => updateProviderConfig({ baseUrl: event.target.value })}
            disabled={draft.providerMode !== "external"}
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

        <div className="settings-actions">
          <button className="button-primary" type="button" onClick={handleSave}>
            Save
          </button>
          {draft.providerMode === "external" ? (
            <button className="button-secondary" type="button" onClick={handleTest}>
              Test Connection
            </button>
          ) : null}
        </div>

        <div className="settings-danger">
          <div className="settings-danger-copy">
            Clear all trees, sessions, and messages. Settings are preserved.
          </div>
          <button className="button-danger" type="button" onClick={onClearAll}>
            Clear All Conversations
          </button>
        </div>

        <div className="settings-footer-status">
          {testStatus ? <div className="status-text">{testStatus}</div> : null}
          {saveStatus ? <div className="status-text">{saveStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}
