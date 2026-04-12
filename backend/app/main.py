from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import settings
from app.limiter import limiter
from app.database import AsyncSessionLocal
from app.replication.scheduler import start_scheduler, stop_scheduler
from app.replication.worker import get_redis
from app.auth.router import router as auth_router
from app.nodes.router import router as nodes_router
from app.files.router import router as files_router
from app.chunks.router import router as chunks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging
    if settings.JWT_SECRET in ("change-this-secret", "dev-secret-change-in-production") or settings.MASTER_ENCRYPTION_KEY == "0" * 64:
        logging.getLogger("uvicorn.error").warning(
            "DSN: JWT_SECRET veya MASTER_ENCRYPTION_KEY varsayılan değerde. Production'da mutlaka .env ile güçlü değerler verin."
        )
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="DSN — Distributed Storage Network API",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if not _origins:
    _origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(nodes_router, prefix=API_PREFIX)
app.include_router(files_router, prefix=API_PREFIX)
app.include_router(chunks_router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness: DB ve Redis erişilebilir mi? Orchestration/load balancer için."""
    errors = []
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception as e:
        errors.append(f"db:{type(e).__name__}")
    try:
        client = get_redis()
        await client.ping()
    except Exception as e:
        errors.append(f"redis:{type(e).__name__}")
    if errors:
        return JSONResponse(
            content={"status": "unhealthy", "errors": errors},
            status_code=503,
        )
    return {"status": "ok"}


_AGENT_LOGIN_HTML = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DSN — Agent Girişi</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0c1220; color: #e2e8f0; font-family: system-ui, sans-serif;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
  }
  .card {
    background: #131c2e; border: 1px solid #1e2d45; border-radius: 12px;
    padding: 40px; width: 100%; max-width: 400px;
  }
  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .logo-icon {
    width: 36px; height: 36px; background: #2563eb; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 18px;
  }
  .logo-text { font-size: 18px; font-weight: 600; }
  .badge {
    font-size: 11px; background: #1e3a5f; color: #60a5fa;
    padding: 3px 10px; border-radius: 20px; margin-bottom: 24px; display: inline-block;
  }
  .tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 1px solid #1e2d45; }
  .tab {
    padding: 10px 20px; cursor: pointer; font-size: 14px; color: #64748b;
    border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; border-top: none;
    border-left: none; border-right: none; transition: all .2s;
  }
  .tab.active { color: #2563eb; border-bottom-color: #2563eb; }
  label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
  input {
    width: 100%; background: #0c1220; border: 1px solid #1e2d45; border-radius: 8px;
    padding: 10px 14px; color: #e2e8f0; font-size: 14px; margin-bottom: 16px; outline: none;
    transition: border-color .2s;
  }
  input:focus { border-color: #2563eb; }
  button[type=submit] {
    width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 8px;
    padding: 11px; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: background .2s; margin-top: 4px;
  }
  button[type=submit]:hover { background: #1d4ed8; }
  button[type=submit]:disabled { background: #1e3a5f; cursor: default; }
  .error { color: #f87171; font-size: 13px; margin-top: 12px; }
  .success {
    text-align: center; padding: 20px 0;
    font-size: 15px; color: #4ade80;
  }
  .success .icon { font-size: 40px; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">D</div>
    <span class="logo-text">DSN</span>
  </div>
  <div class="badge">🔧 Agent Kurulum Sihirbazı için giriş</div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('login')">Giriş Yap</button>
    <button class="tab" onclick="switchTab('register')">Kayıt Ol</button>
  </div>

  <div id="success" style="display:none" class="success">
    <div class="icon">✓</div>
    <div>Giriş başarılı!</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:8px">Sihirbaza yönlendiriliyorsunuz...</div>
  </div>

  <form id="form" onsubmit="handleSubmit(event)">
    <div id="email-group">
      <label for="email">E-posta</label>
      <input id="email" type="email" required autocomplete="email" placeholder="ornek@mail.com">
    </div>
    <div id="password-group">
      <label for="password">Şifre</label>
      <input id="password" type="password" required autocomplete="current-password" placeholder="••••••••">
    </div>
    <button type="submit" id="submit-btn">Giriş Yap</button>
    <div id="error-msg" class="error"></div>
  </form>
</div>

<script>
let currentTab = 'login';

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  document.getElementById('submit-btn').textContent = tab === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  document.getElementById('error-msg').textContent = '';
}

async function handleSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('submit-btn');
  const errEl = document.getElementById('error-msg');

  btn.disabled = true;
  btn.textContent = 'Lütfen bekleyin...';
  errEl.textContent = '';

  const endpoint = currentTab === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.detail || 'Bir hata oluştu.';
      btn.disabled = false;
      btn.textContent = currentTab === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
      return;
    }

    document.getElementById('form').style.display = 'none';
    document.getElementById('success').style.display = 'block';

    setTimeout(() => {
      window.location.href = 'dsn-agent://auth?token=' + encodeURIComponent(data.access_token);
    }, 500);

  } catch (err) {
    errEl.textContent = 'Sunucuya ulaşılamadı.';
    btn.disabled = false;
    btn.textContent = currentTab === 'login' ? 'Giriş Yap' : 'Kayıt Ol';
  }
}
</script>
</body>
</html>"""


@app.get("/agent-login", response_class=HTMLResponse)
async def agent_login_page():
    """Self-contained login page opened by the DSN installer wizard."""
    return HTMLResponse(content=_AGENT_LOGIN_HTML)
