const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_ACCESS_TOKEN;
const STORE = "pastes";
const BLOBS_BASE = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE}`;
const ROOT_CODE = process.env.ROOT_CODE;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export const handler = async (event) => {
    const { httpMethod, queryStringParameters } = event;

    if (httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

    const qs = queryStringParameters || {};
    let code = qs.code;

    // Also accept code from POST body
    if (!code && event.body) {
        try { code = JSON.parse(event.body).code; } catch { }
    }

    if (code !== ROOT_CODE) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Invalid account code" }),
            headers: { ...cors, "Content-Type": "application/json" },
        };
    }

    const action = qs.action;

    // --- LIST ALL PASTES ---
    if (action === "list") {
        try {
            const res = await fetch(`${BLOBS_BASE}`, {
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            if (!res.ok) throw new Error(`Blobs list failed: ${res.status}`);
            const data = await res.json();
            const blobs = data.blobs || data.entries || data || [];
            return {
                statusCode: 200,
                body: JSON.stringify({ pastes: blobs }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        } catch (err) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: err.message }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        }
    }

    // --- VIEW SINGLE PASTE ---
    if (action === "view") {
        const id = qs.id;
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }), headers: { ...cors, "Content-Type": "application/json" } };
        try {
            const res = await fetch(`${BLOBS_BASE}/${id}`, {
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            if (res.status === 404) return { statusCode: 404, body: JSON.stringify({ error: "Paste not found" }), headers: { ...cors, "Content-Type": "application/json" } };
            if (!res.ok) throw new Error(`Blob GET failed: ${res.status}`);
            const content = await res.text();
            return {
                statusCode: 200,
                body: JSON.stringify({ id, content }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        } catch (err) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: err.message }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        }
    }

    // --- DELETE A PASTE ---
    if (action === "delete") {
        const id = qs.id;
        if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }), headers: { ...cors, "Content-Type": "application/json" } };
        try {
            const res = await fetch(`${BLOBS_BASE}/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            if (res.status === 404) return { statusCode: 404, body: JSON.stringify({ error: "Paste not found" }), headers: { ...cors, "Content-Type": "application/json" } };
            if (!res.ok) throw new Error(`Blob DELETE failed: ${res.status}`);
            return {
                statusCode: 200,
                body: JSON.stringify({ ok: true, deleted: id }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        } catch (err) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: err.message }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        }
    }

    // --- EDIT A PASTE ---
    if (action === "edit") {
        const id = qs.id;
        let newContent;
        try { newContent = JSON.parse(event.body || '{}').content; } catch { }
        if (!id || !newContent) return { statusCode: 400, body: JSON.stringify({ error: "Missing id or content" }), headers: { ...cors, "Content-Type": "application/json" } };
        try {
            const res = await fetch(`${BLOBS_BASE}/${id}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "text/plain; charset=utf-8" },
                body: newContent,
            });
            if (!res.ok) throw new Error(`Blob PUT failed: ${res.status}`);
            return {
                statusCode: 200,
                body: JSON.stringify({ ok: true, id }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        } catch (err) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: err.message }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        }
    }

    // --- USER MANAGEMENT ---

    const USERS_BASE = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/users`;
    const SESSIONS_BASE = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/sessions`;

    if (action === "listUsers") {
        try {
            const res = await fetch(`${USERS_BASE}`, {
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            const data = await res.json();
            const blobs = data.blobs || data.entries || data || [];

            // Get detailed info for each user
            const users = await Promise.all(blobs.map(async (b) => {
                const userRes = await fetch(`${USERS_BASE}/${b.key}`, {
                    headers: { Authorization: `Bearer ${TOKEN}` },
                });
                return await userRes.json();
            }));

            return {
                statusCode: 200,
                body: JSON.stringify({ users }),
                headers: { ...cors, "Content-Type": "application/json" },
            };
        } catch (err) {
            return { statusCode: 500, body: JSON.stringify({ error: err.message }), headers: { ...cors, "Content-Type": "application/json" } };
        }
    }

    if (action === "addUser" || action === "updateUser") {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { }
        const { username, password, plainPassword } = body;
        const targetUser = qs.username || username;

        if (!targetUser) return { statusCode: 400, body: JSON.stringify({ error: "Username required" }), headers: { ...cors, "Content-Type": "application/json" } };

        try {
            let userData = {};
            if (action === "updateUser") {
                const existingRes = await fetch(`${USERS_BASE}/${encodeURIComponent(targetUser.toLowerCase())}`, {
                    headers: { Authorization: `Bearer ${TOKEN}` },
                });
                if (existingRes.ok) userData = await existingRes.json();
            }

            if (password) {
                const crypto = await import('crypto');
                const salt = crypto.randomBytes(16).toString('hex');
                const passwordHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
                userData.passwordHash = passwordHash;
                userData.salt = salt;
                userData.plainPassword = plainPassword || password; // Store plain for admin view as requested
            }

            if (username && action === "addUser") userData.username = username;
            if (!userData.createdAt) userData.createdAt = new Date().toISOString();

            const res = await fetch(`${USERS_BASE}/${encodeURIComponent(targetUser.toLowerCase())}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify(userData),
            });

            return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { ...cors, "Content-Type": "application/json" } };
        } catch (err) {
            return { statusCode: 500, body: JSON.stringify({ error: err.message }), headers: { ...cors, "Content-Type": "application/json" } };
        }
    }

    if (action === "removeUser") {
        const username = qs.username;
        if (!username) return { statusCode: 400, body: JSON.stringify({ error: "Username required" }), headers: { ...cors, "Content-Type": "application/json" } };
        try {
            await fetch(`${USERS_BASE}/${encodeURIComponent(username.toLowerCase())}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { ...cors, "Content-Type": "application/json" } };
        } catch (err) {
            return { statusCode: 500, body: JSON.stringify({ error: err.message }), headers: { ...cors, "Content-Type": "application/json" } };
        }
    }

    if (action === "renameUser") {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { }
        const { oldUsername, newUsername } = body;
        if (!oldUsername || !newUsername) return { statusCode: 400, body: JSON.stringify({ error: "Both old and new usernames required" }), headers: { ...cors, "Content-Type": "application/json" } };

        try {
            const oldRes = await fetch(`${USERS_BASE}/${encodeURIComponent(oldUsername.toLowerCase())}`, {
                headers: { Authorization: `Bearer ${TOKEN}` },
            });
            if (!oldRes.ok) throw new Error("User not found");
            const userData = await oldRes.json();
            userData.username = newUsername;

            // Create new
            await fetch(`${USERS_BASE}/${encodeURIComponent(newUsername.toLowerCase())}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify(userData),
            });

            // Delete old
            await fetch(`${USERS_BASE}/${encodeURIComponent(oldUsername.toLowerCase())}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${TOKEN}` },
            });

            return { statusCode: 200, body: JSON.stringify({ ok: true }), headers: { ...cors, "Content-Type": "application/json" } };
        } catch (err) {
            return { statusCode: 500, body: JSON.stringify({ error: err.message }), headers: { ...cors, "Content-Type": "application/json" } };
        }
    }

    // --- VERIFY CODE (login check) ---
    if (action === "login" || !action) {
        return {
            statusCode: 200,
            body: JSON.stringify({ ok: true, role: "root" }),
            headers: { ...cors, "Content-Type": "application/json" },
        };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }), headers: { ...cors, "Content-Type": "application/json" } };
};
