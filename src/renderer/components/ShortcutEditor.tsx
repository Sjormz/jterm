import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useKeybindings } from '../KeybindingsContext';
import {
  KeybindingAction,
  KEYBINDING_LABELS,
  formatShortcut,
} from '../keybindings';

export default function ShortcutEditor() {
  const { bindings, setBinding, resetDefaults } = useKeybindings();
  const [capturing, setCapturing] = useState<KeybindingAction | null>(null);
  const captureInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (capturing && captureInputRef.current) {
      captureInputRef.current.focus();
    }
  }, [capturing]);

  const handleStartCapture = useCallback((action: KeybindingAction) => {
    setCapturing(action);
  }, []);

  const handleCaptureKey = useCallback(
    (action: KeybindingAction) => (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const shortcut = formatShortcut(e.nativeEvent);
      // Require at least one modifier key
      if (!shortcut.includes('+')) return;
      setBinding(action, shortcut);
      setCapturing(null);
    },
    [setBinding],
  );

  const keys = Object.keys(KEYBINDING_LABELS) as KeybindingAction[];

  return (
    <div className="shortcut-editor">
      <div className="shortcut-editor-header">
        <span className="section-title">Keyboard Shortcuts</span>
      </div>
      <div className="shortcut-list">
        {keys.map((action) => (
          <div key={action} className="shortcut-row">
            <span className="shortcut-label">{KEYBINDING_LABELS[action]}</span>
            {capturing === action ? (
              <div
                ref={captureInputRef}
                className="shortcut-key capturing"
                tabIndex={0}
                onKeyDown={handleCaptureKey(action)}
                onBlur={() => setCapturing(null)}
              >
                Press keys...
              </div>
            ) : (
              <button
                className="shortcut-key"
                onClick={() => handleStartCapture(action)}
                title="Click to rebind"
              >
                <span className="shortcut-keys-text">{bindings[action]}</span>
                <span className="shortcut-edit-icon">✎</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="shortcut-reset-btn" onClick={resetDefaults}>
        Reset All to Defaults
      </button>
    </div>
  );
}
