import crypto from 'crypto';

const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_ACCESS_TOKEN;
const BASE = `https://api.netlify.com/api/v1/blobs/${SITE_ID}`;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (body, status = 200) => ({ statusCode: status, body: JSON.stringify(body), headers: { ...cors, "Content-Type": "application/json" } });

function checkEnv() {
    if (!SITE_ID || !TOKEN) {
        throw new Error("Netlify Blobs not configured. Please set NETLIFY_SITE_ID and NETLIFY_ACCESS_TOKEN in your Netlify environment variables.");
    }
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

async function blobGet(store, key) {
    const res = await fetch(`${BASE}/${store}/${encodeURIComponent(key)}`, { headers: AUTH });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Blob GET ${store}/${key} failed: ${res.status}`);
    return await res.text();
}

async function blobSet(store, key, value) {
    const res = await fetch(`${BASE}/${store}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: typeof value === 'string' ? value : JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Blob PUT ${store}/${key} failed: ${res.status} ${await res.text()}`);
}

async function blobDelete(store, key) {
    await fetch(`${BASE}/${store}/${encodeURIComponent(key)}`, { method: 'DELETE', headers: AUTH });
}

}

export const handler = async (event) => {
    try {
        checkEnv();
        if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

        const qs = event.queryStringParameters || {};
        const action = qs.action;
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { }
        const clientIp = event.headers['x-forwarded-for'] || '';

        // ─── SIGNUP ────────────────────────────────────────────────────────────────
        if (action === 'signup') {
            const { username, password, captchaToken } = body;
            if (!username || !password) return json({ error: 'Username and password required' }, 400);
            if (username.length < 3 || username.length > 20) return json({ error: 'Username must be 3–20 characters' }, 400);
            if (!/^[a-zA-Z0-9_]+$/.test(username)) return json({ error: 'Username: letters, numbers, underscores only' }, 400);
            if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

            const existing = await blobGet('users', username.toLowerCase());
            if (existing) return json({ error: 'Username already taken' }, 409);

            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(password, salt);
            await blobSet('users', username.toLowerCase(), { username, passwordHash, salt, createdAt: new Date().toISOString() });

            const sessionToken = crypto.randomBytes(32).toString('hex');
            await blobSet('sessions', sessionToken, { username, createdAt: new Date().toISOString() });

            return json({ ok: true, token: sessionToken, username });
        }

        // ─── LOGIN ─────────────────────────────────────────────────────────────────
        if (action === 'login') {
            const { username, password } = body;
            if (!username || !password) return json({ error: 'Username and password required' }, 400);

            const userJson = await blobGet('users', username.toLowerCase());
            if (!userJson) return json({ error: 'Invalid username or password' }, 401);

            let user;
            try { user = JSON.parse(userJson); } catch { return json({ error: 'Account data corrupted' }, 500); }

            const hash = hashPassword(password, user.salt);
            if (hash !== user.passwordHash) return json({ error: 'Invalid username or password' }, 401);

            const sessionToken = crypto.randomBytes(32).toString('hex');
            await blobSet('sessions', sessionToken, { username: user.username, createdAt: new Date().toISOString() });

            return json({ ok: true, token: sessionToken, username: user.username });
        }

        // ─── VERIFY SESSION ────────────────────────────────────────────────────────
        if (action === 'verify') {
            const { token } = qs;
            if (!token) return json({ error: 'Token required' }, 400);

            const sessionJson = await blobGet('sessions', token);
            if (!sessionJson) return json({ error: 'Invalid or expired session' }, 401);

            let session;
            try { session = JSON.parse(sessionJson); } catch { return json({ error: 'Session data corrupted' }, 500); }

            const age = Date.now() - new Date(session.createdAt).getTime();
            if (age > 7 * 24 * 60 * 60 * 1000) {
                await blobDelete('sessions', token);
                return json({ error: 'Session expired, please log in again' }, 401);
            }

            return json({ ok: true, username: session.username });
        }

        // ─── LOGOUT ────────────────────────────────────────────────────────────────
        if (action === 'logout') {
            const { token } = body;
            if (token) await blobDelete('sessions', token);
            return json({ ok: true });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (err) {
        console.error("Auth error:", err);
        return json({ error: "Server error: " + err.message }, 500);
    }
};
