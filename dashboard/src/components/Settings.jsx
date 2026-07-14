import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, KeyRound, RefreshCw, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useRiseupSessionInfo } from '../hooks/useData';

// Days between now and an ISO date (positive = future, negative = past).
function daysUntil(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.round((then - Date.now()) / (1000 * 60 * 60 * 24));
}

function StatusCard({ info }) {
    if (info === undefined) {
        return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading session status…</div>;
    }

    const days = daysUntil(info?.expiresAt);
    let icon, color, title, detail;

    if (!info?.configured) {
        icon = <ShieldX size={20} />;
        color = 'var(--text-muted)';
        title = 'Not configured';
        detail = 'No RiseUp session is stored. Paste a session below to enable Refresh.';
    } else if (days !== null && days < 0) {
        icon = <ShieldX size={20} />;
        color = 'var(--accent-danger)';
        title = `Session expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
        detail = 'Refresh will fail until you paste a fresh session below.';
    } else if (days !== null && days <= 5) {
        icon = <ShieldAlert size={20} />;
        color = 'var(--accent-warning, #f5a623)';
        title = `Session expires in ${days} day${days === 1 ? '' : 's'}`;
        detail = 'Consider re-logging in soon to avoid interruption.';
    } else {
        icon = <ShieldCheck size={20} />;
        color = 'var(--accent-success)';
        title = days !== null ? `Connected — expires in ${days} days` : 'Connected';
        detail = info?.expiresAt ? `Valid until ${new Date(info.expiresAt).toLocaleDateString()}` : 'Session is stored.';
    }

    return (
        <div className="glass-panel" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ color }}>{icon}</div>
                <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color }}>{title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{detail}</div>
                </div>
            </div>
            {info?.configured && info?.commitHash && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', fontFamily: 'monospace' }}>
                    Commit hash: {info.commitHash}
                </div>
            )}
        </div>
    );
}

export default function Settings() {
    const info = useRiseupSessionInfo();
    const setRiseupSession = useMutation(api.mutations.setRiseupSession);

    const [raw, setRaw] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null); // { type: 'success' | 'error', text }
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMsg, setRefreshMsg] = useState(null);

    // Accepts either the full session.json contents, or a bare cookie string.
    const parseInput = (text) => {
        const trimmed = text.trim();
        if (!trimmed) throw new Error('Paste your session.json contents first.');
        // Try JSON (session.json) first.
        if (trimmed.startsWith('{')) {
            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                throw new Error('That looks like JSON but could not be parsed. Copy the full session.json contents.');
            }
            if (!parsed.cookies || !parsed.commitHash) {
                throw new Error('JSON is missing "cookies" and/or "commitHash". Re-run `riseup login`.');
            }
            return { cookies: String(parsed.cookies), commitHash: String(parsed.commitHash), expiresAt: parsed.expiresAt || undefined };
        }
        throw new Error('Paste the full session.json contents (must start with "{").');
    };

    const handleSave = async () => {
        setMsg(null);
        setSaving(true);
        try {
            const { cookies, commitHash, expiresAt } = parseInput(raw);
            await setRiseupSession({ cookies, commitHash, expiresAt });
            setRaw('');
            setMsg({ type: 'success', text: 'Session saved. You can Refresh now.' });
        } catch (e) {
            setMsg({ type: 'error', text: e.message || 'Failed to save session.' });
        } finally {
            setSaving(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setRefreshMsg(null);
        try {
            const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_CONVEX_URL?.replace('.cloud', '.site') || '';
            const res = await fetch(`${siteUrl}/refresh`, { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                setRefreshMsg({ type: 'success', text: data.errors?.length ? `Refreshed (${data.errors.length} warnings)` : 'Data refreshed!' });
            } else {
                const detail = data.error || (data.errors?.length ? data.errors[0] : null);
                setRefreshMsg({ type: 'error', text: detail ? `Refresh failed: ${detail}` : 'Refresh failed' });
            }
        } catch {
            setRefreshMsg({ type: 'error', text: 'Refresh failed — server unreachable' });
        } finally {
            setRefreshing(false);
        }
    };

    const banner = (m) => m && (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginTop: '12px',
            background: m.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(255,0,85,0.06)',
            border: `1px solid ${m.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(255,0,85,0.15)'}`,
            color: m.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
        }}>
            {m.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {m.text}
        </div>
    );

    return (
        <div style={{ maxWidth: '780px' }}>
            <StatusCard info={info} />

            {/* Update session */}
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <KeyRound size={18} color="var(--accent-primary)" />
                    <h3 style={{ fontWeight: 600 }}>Update RiseUp session</h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Paste the contents of <code>~/.config/riseup-cli/session.json</code> below. It is
                    stored server-side (in Convex) and used to fetch your data on Refresh.
                </p>

                <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder='{"cookies":"…","commitHash":"…","expiresAt":"…"}'
                    spellCheck={false}
                    style={{
                        width: '100%', minHeight: '120px', resize: 'vertical',
                        padding: '12px', borderRadius: '8px', fontSize: '12px',
                        border: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace',
                    }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving || !raw.trim()}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            cursor: saving || !raw.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            border: '1px solid var(--accent-primary)', background: 'rgba(0,240,255,0.12)',
                            color: 'var(--accent-primary)', opacity: saving || !raw.trim() ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        <KeyRound size={12} /> {saving ? 'Saving…' : 'Save session'}
                    </button>

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing || !info?.configured}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            cursor: refreshing || !info?.configured ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)',
                            color: 'var(--accent-success)', opacity: refreshing || !info?.configured ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshing ? 'Refreshing…' : 'Refresh data now'}
                    </button>
                </div>

                {banner(msg)}
                {banner(refreshMsg)}
            </div>

            {/* Instructions */}
            <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <Terminal size={18} color="var(--text-secondary)" />
                    <h3 style={{ fontWeight: 600 }}>How to get a fresh session</h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    RiseUp login requires an interactive browser (Google OAuth + SMS), so it runs
                    locally via the CLI. From the project root:
                </p>
                <ol style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '18px', lineHeight: 1.9 }}>
                    <li>Run <code>node riseup-cli-main/dist/cli.js login</code> and complete the sign-in in the browser window.</li>
                    <li>Copy the session: <code>cat ~/.config/riseup-cli/session.json | pbcopy</code></li>
                    <li>Paste it into the box above and click <strong>Save session</strong>.</li>
                    <li>Click <strong>Refresh data now</strong> to verify.</li>
                </ol>
            </div>
        </div>
    );
}
