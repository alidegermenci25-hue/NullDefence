/* ====================================================
   N U L L D E F E N S E  —  Client Logic v3 (Auth)
   ==================================================== */

const $ = (s) => document.querySelector(s);

// --- DOM Refs ---
const codeEditor = $("#codeEditor");
const lineNumbers = $("#lineNumbers");
const charCount = $("#charCount");
const lineCount = $("#lineCount");
const createBtn = $("#createBtn");
const clearBtn = $("#clearBtn");
const editorSection = $("#editorSection");
const resultSection = $("#resultSection");
const rawUrlInput = $("#rawUrlInput");
const psOnelinerInput = $("#psOnelinerInput");
const copyRawBtn = $("#copyRawBtn");
const copyPsBtn = $("#copyPsBtn");
const newPasteBtn = $("#newPasteBtn");
const toast = $("#toast");
const toastText = $("#toastText");

// =============================================
//  AUTHENTICATION
// =============================================
let currentAuthMode = 'login';
let sessionToken = localStorage.getItem('nd_session_token');

function updateAuthUI(username) {
    if (username) {
        $("#authBtns").style.display = 'none';
        $("#userBtns").style.display = 'flex';
        $("#navUser").textContent = username;
    } else {
        $("#authBtns").style.display = 'flex';
        $("#userBtns").style.display = 'none';
        $("#navUser").textContent = '';
    }
}

async function checkSession() {
    if (!sessionToken) return;
    try {
        const res = await fetch(`/api/auth?action=verify&token=${sessionToken}`);
        if (res.ok) {
            const data = await res.json();
            updateAuthUI(data.username);
        } else {
            doLogout();
        }
    } catch (e) {
        console.error("Session check failed", e);
    }
}

window.openAuth = (mode) => {
    currentAuthMode = mode;
    switchTab(mode);
    $("#authOverlay").style.display = 'flex';
    $("#authErr").style.display = 'none';
};

window.closeAuth = () => {
    $("#authOverlay").style.display = 'none';
};

window.switchTab = (mode) => {
    currentAuthMode = mode;
    const isLogin = mode === 'login';
    $("#tabLogin").style.background = isLogin ? '#00e5ff' : 'none';
    $("#tabLogin").style.color = isLogin ? '#000' : '#a0a5b1';
    $("#tabSignup").style.background = isLogin ? 'none' : '#00e5ff';
    $("#tabSignup").style.color = isLogin ? '#a0a5b1' : '#000';
    $("#authSubmitBtn").textContent = isLogin ? 'Login' : 'Sign Up';
};

window.submitAuth = async () => {
    const username = $("#authUser").value.trim();
    const password = $("#authPass").value.trim();
    const btn = $("#authSubmitBtn");
    const err = $("#authErr");

    if (!username || !password) {
        err.textContent = "Username and password required";
        err.style.display = 'block';
        return;
    }

    const body = { username, password };

    btn.disabled = true;
    btn.textContent = 'Processing...';
    err.style.display = 'none';

    try {
        const res = await fetch(`/api/auth?action=${currentAuthMode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok) {
            sessionToken = data.token;
            localStorage.setItem('nd_session_token', sessionToken);
            updateAuthUI(data.username);
            closeAuth();
            showToast(`Welcome, ${data.username}!`);
        } else {
            err.textContent = data.error || "Authentication failed";
            err.style.display = 'block';
        }
    } catch (e) {
        err.textContent = "Connection error";
        err.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = currentAuthMode === 'login' ? 'Login' : 'Sign Up';
    }
};

window.doLogout = () => {
    fetch('/api/auth?action=logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken })
    });
    sessionToken = null;
    localStorage.removeItem('nd_session_token');
    updateAuthUI(null);
    showToast("Logged out successfully");
};

// =============================================
//  LINE NUMBERS & STATS
// =============================================
function updateLineNumbers() {
    const lines = codeEditor.value.split("\n").length;
    const nums = [];
    for (let i = 1; i <= Math.max(lines, 1); i++) {
        nums.push(`<span>${i}</span>`);
    }
    lineNumbers.innerHTML = nums.join("");
}

function updateStats() {
    const val = codeEditor.value;
    const chars = val.length;
    const lines = val ? val.split("\n").length : 0;
    charCount.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg> ${chars.toLocaleString()} chars`;
    lineCount.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H3M21 6H3M21 14H3M21 18H3"/></svg> ${lines} lines`;
}

codeEditor.addEventListener("input", () => {
    updateLineNumbers();
    updateStats();
});

codeEditor.addEventListener("scroll", () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
});

codeEditor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end = codeEditor.selectionEnd;
        codeEditor.value = codeEditor.value.substring(0, start) + "  " + codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 2;
        codeEditor.dispatchEvent(new Event("input"));
    }
});

// =============================================
//  CREATE PASTE
// =============================================
createBtn.addEventListener("click", async () => {
    if (!sessionToken) {
        showToast("Please login to create a paste", "warn");
        openAuth('login');
        return;
    }

    const content = codeEditor.value.trim();
    if (!content) {
        showToast("Write some code first!", "warn");
        return;
    }

    createBtn.classList.add("loading");

    try {
        const res = await fetch("/api/paste", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, sessionToken }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 401) {
                doLogout();
                throw new Error("Session expired. Please login again.");
            }
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        rawUrlInput.value = data.rawUrl;
        psOnelinerInput.value = `irm '${data.rawUrl}' | iex`;

        editorSection.classList.add("hidden");
        resultSection.classList.remove("hidden");

        showToast("Paste created successfully!");
    } catch (err) {
        showToast(`Error: ${err.message}`, "error");
    } finally {
        createBtn.classList.remove("loading");
    }
});

clearBtn.addEventListener("click", () => {
    codeEditor.value = "";
    codeEditor.dispatchEvent(new Event("input"));
    codeEditor.focus();
});

// =============================================
//  COPY & UI
// =============================================
function copyToClipboard(inputId, btn) {
    const input = $(`#${inputId}`);
    if (!input) return;

    navigator.clipboard.writeText(input.value).then(() => {
        btn.classList.add("copied");
        const spanEl = btn.querySelector("span");
        const original = spanEl.textContent;
        spanEl.textContent = "Copied!";
        showToast("Copied to clipboard!", "success");

        setTimeout(() => {
            btn.classList.remove("copied");
            spanEl.textContent = original;
        }, 1500);
    });
}

copyRawBtn.addEventListener("click", () => copyToClipboard("rawUrlInput", copyRawBtn));
copyPsBtn.addEventListener("click", () => copyToClipboard("psOnelinerInput", copyPsBtn));

newPasteBtn.addEventListener("click", () => {
    resultSection.classList.add("hidden");
    editorSection.classList.remove("hidden");
    codeEditor.value = "";
    updateLineNumbers();
    updateStats();
    codeEditor.focus();
});

let toastTimer;
function showToast(msg, type = "success") {
    toastText.textContent = msg;
    toast.className = `toast show ${type}`;

    let icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    if (type === "warn") icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    if (type === "error") icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';

    toast.innerHTML = `${icon} <span id="toastText">${msg}</span>`;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// =============================================
//  PARTICLE BACKGROUND
// =============================================
(function initParticles() {
    const canvas = $("#particleCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let particles = [];
    let w, h;
    const PARTICLE_COUNT = 50;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }

    function createParticle() {
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 1.5 + 0.5,
            alpha: Math.random() * 0.3 + 0.05,
            pulse: Math.random() * Math.PI * 2,
        };
    }

    function init() {
        resize();
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(createParticle());
        }
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.01;
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;
            const a = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 136, ${a})`;
            ctx.fill();
        }
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    const lineAlpha = (1 - dist / 150) * 0.06;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 255, 136, ${lineAlpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    init();
    draw();
})();

// Start checks
checkSession();
updateLineNumbers();
updateStats();
