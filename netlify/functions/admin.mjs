const SITE_ID = "c3c7670f-0c19-4a55-8d4c-b233dc320262";
const TOKEN = "nfp_9eGBfG9JiD2bBuJtDazkxPqXaLGzkmoK4ade";
const STORE = "pastes";
const BLOBS_BASE = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE}`;
const ROOT_CODE = "96399639";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

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
            // Normalise: Netlify returns { blobs: [{key, etag, size, ...}] }
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
