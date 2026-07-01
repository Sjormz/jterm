import React, { useState } from 'react';
import { SavedSSHProfile, SessionInfo } from '../types';
import { PlusIcon, XCloseIcon, ServerIcon, AlertIcon, PlugIcon } from '../icons';

interface SSHManagerProps {
  sshProfiles: SavedSSHProfile[];
  onConnected: (session: SessionInfo) => void;
  onProfilesChange: (profiles: SavedSSHProfile[]) => void;
}

function profileId(host: string, port: number, username: string, auth: 'password' | 'key') {
  return `${username}@${host}:${port}:${auth}`.toLowerCase();
}

export default function SSHManager({
  sshProfiles,
  onConnected,
  onProfilesChange,
}: SSHManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [auth, setAuth] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setHost('');
    setPort('22');
    setUsername('');
    setAuth('password');
    setPassword('');
    setPrivateKey('');
    setError(null);
  };

  const saveProfile = (profile: SavedSSHProfile) => {
    const next = [profile, ...sshProfiles.filter((p) => p.id !== profile.id)];
    onProfilesChange(next);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !username) return;
    setConnecting(true);
    setError(null);

    const parsedPort = parseInt(port) || 22;
    const sessionId = `ssh-${Date.now()}`;

    try {
      await window.janet.sshConnect({
        id: sessionId,
        host,
        port: parsedPort,
        username,
        auth,
        password: auth === 'password' ? password : undefined,
        privateKey: auth === 'key' ? privateKey : undefined,
      });

      saveProfile({
        id: profileId(host, parsedPort, username, auth),
        host,
        port: parsedPort,
        username,
        auth,
        password: auth === 'password' ? password : undefined,
        privateKey: auth === 'key' ? privateKey : undefined,
      });
      onConnected({ id: sessionId, host, port: parsedPort, username });
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const editProfile = (profile: SavedSSHProfile) => {
    setHost(profile.host);
    setPort(String(profile.port));
    setUsername(profile.username);
    setAuth(profile.auth);
    setPassword(profile.password ?? '');
    setPrivateKey(profile.privateKey ?? '');
    setError(null);
    setShowForm(true);
  };

  const connectProfile = async (profile: SavedSSHProfile) => {
    setConnecting(true);
    setError(null);
    const sessionId = `ssh-${Date.now()}`;

    try {
      await window.janet.sshConnect({
        id: sessionId,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        auth: profile.auth,
        password: profile.auth === 'password' ? profile.password : undefined,
        privateKey: profile.auth === 'key' ? profile.privateKey : undefined,
      });
      onConnected({
        id: sessionId,
        host: profile.host,
        port: profile.port,
        username: profile.username,
      });
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const forgetProfile = (profileIdToRemove: string) => {
    onProfilesChange(sshProfiles.filter((profile) => profile.id !== profileIdToRemove));
  };

  const handleProfileAction = (profile: SavedSSHProfile, action: string) => {
    if (action === 'edit') editProfile(profile);
    if (action === 'delete') forgetProfile(profile.id);
  };

  const hasSavedProfiles = sshProfiles.length > 0;

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
        {hasSavedProfiles && (
          <div className="ssh-list-group">
            <div className="ssh-list-title">Saved</div>
            {sshProfiles.map((profile) => (
              <div key={profile.id} className="ssh-session-item">
                <div className="session-info">
                  <ServerIcon size="md" className="session-icon saved" />
                  <div className="session-details">
                    <span className="session-user">{profile.username}</span>
                    <span className="session-host">@{profile.host}:{profile.port}</span>
                  </div>
                </div>
                <div className="session-actions">
                  <button
                    className="session-action-btn"
                    onClick={() => connectProfile(profile)}
                    disabled={connecting}
                    title="Connect"
                    aria-label={`Connect to ${profile.username}@${profile.host}`}
                  >
                    <PlugIcon size="sm" />
                  </button>
                  <select
                    className="session-action-select"
                    value=""
                    aria-label={`Actions for ${profile.username}@${profile.host}`}
                    onChange={(e) => {
                      handleProfileAction(profile, e.target.value);
                      e.currentTarget.value = '';
                    }}
                  >
                    <option value="" disabled>More</option>
                    <option value="edit">Edit</option>
                    <option value="delete">Delete</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasSavedProfiles && (
          <div className="ssh-empty">No SSH connections saved</div>
        )}
      </div>
    </div>
  );
}
