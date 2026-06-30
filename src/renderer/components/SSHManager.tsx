import React, { useState } from 'react';
import { SessionInfo } from '../types';
import { PlusIcon, XCloseIcon, ServerIcon, UnplugIcon, AlertIcon } from '../icons';

interface SSHManagerProps {
  sshSessions: SessionInfo[];
  onConnected: (session: SessionInfo) => void;
  onDisconnected: (sessionId: string) => void;
}

export default function SSHManager({ sshSessions, onConnected, onDisconnected }: SSHManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [auth, setAuth] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) return;
    setConnecting(true);
    setError(null);
    const sessionId = `ssh-${Date.now()}`;
    try {
      await window.janet.sshConnect({
        id: sessionId,
        host,
        port: parseInt(port) || 22,
        username,
        auth,
        password: auth === 'password' ? password : undefined,
        privateKey: auth === 'key' ? privateKey : undefined,
      });
      onConnected({ id: sessionId, host, port: parseInt(port) || 22, username });
      setShowForm(false);
      setHost(''); setPort('22'); setUsername(''); setPassword(''); setPrivateKey('');
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await window.janet.sshDisconnect({ id: sessionId });
      onDisconnected(sessionId);
    } catch {}
  };

  return (
    <div className="ssh-manager">
      <div className="ssh-header">
        <span className="section-title">SSH Connections</span>
        <button
          className="icon-btn"
          onClick={() => setShowForm((v) => !v)}
          title={showForm ? 'Close form' : 'New connection'}
          aria-label={showForm ? 'Close form' : 'New connection'}
        >
          {showForm ? <XCloseIcon size="sm" /> : <PlusIcon size="sm" />}
        </button>
      </div>

      {showForm && (
        <form className="ssh-form" onSubmit={handleConnect}>
          <div className="form-row">
            <input
              type="text"
              placeholder="Host (e.g. 192.168.1.100)"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-row form-row-2">
            <input
              type="text"
              placeholder="Port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="form-input"
            />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-row auth-row">
            <button
              type="button"
              className={`auth-btn ${auth === 'password' ? 'active' : ''}`}
              onClick={() => setAuth('password')}
            >Password</button>
            <button
              type="button"
              className={`auth-btn ${auth === 'key' ? 'active' : ''}`}
              onClick={() => setAuth('key')}
            >Key</button>
          </div>
          {auth === 'password' ? (
            <div className="form-row">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>
          ) : (
            <div className="form-row">
              <textarea
                placeholder="Paste private key (RSA/ED25519)"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="form-input form-textarea"
                rows={4}
              />
            </div>
          )}
          {error && (
            <div className="ssh-error">
              <AlertIcon size="sm" /> {error}
            </div>
          )}
          <button type="submit" className="connect-btn" disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}

      <div className="ssh-sessions">
        {sshSessions.length === 0 ? (
          <div className="ssh-empty">No active connections</div>
        ) : (
          sshSessions.map((session) => (
            <div key={session.id} className="ssh-session-item">
              <div className="session-info">
                <ServerIcon size="md" className="session-icon" />
                <div className="session-details">
                  <span className="session-user">{session.username}</span>
                  <span className="session-host">@{session.host}:{session.port}</span>
                </div>
              </div>
              <button
                className="disconnect-btn"
                onClick={() => handleDisconnect(session.id)}
                title="Disconnect"
                aria-label="Disconnect"
              >
                <UnplugIcon size="sm" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
