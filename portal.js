
let lang = localStorage.getItem('luxPortalLang') || 'en';
let device = '';
let token = '';
let publicKey = null;
let deviceInfo = null;

const $ = selector => document.querySelector(selector);

const t = key =>
  (dict[lang] || dict.en)[key] ||
  dict.en[key] ||
  key;

const messages = {
  mk: {
    INVALID_CREDENTIALS: 'Неточна MAC адреса или PIN.',
    TOO_MANY_ATTEMPTS: 'Премногу обиди. Обиди се повторно за 15 минути.',
    SERVER_NOT_READY: 'Серверот сè уште не е подготвен.',
    SERVER_NOT_CONFIGURED: 'Недостасува серверска конфигурација.',
    LOGIN_FAILED: 'Настана грешка при најавувањето.',
    INVALID_REQUEST: 'Невалидно барање.',
    NETWORK_ERROR: 'Нема врска со серверот. Провери го интернетот.',
    SYNC_NOT_READY: 'Синхронизацијата на плејлисти сè уште не е активирана.',
    SESSION_EXPIRED: 'Сесијата е истечена. Најави се повторно.',
    SESSION_EXPIRED_OR_INVALID: 'Испраќањето е одбиено: сесијата е истечена или уредот нема активна лиценца/синхронизација. Одјави се и најави се повторно; провери key_ready во Supabase.'
  },

  en: {
    INVALID_CREDENTIALS: 'Incorrect MAC address or PIN.',
    TOO_MANY_ATTEMPTS: 'Too many attempts. Try again in 15 minutes.',
    SERVER_NOT_READY: 'The server is not ready yet.',
    SERVER_NOT_CONFIGURED: 'Server configuration is missing.',
    LOGIN_FAILED: 'An error occurred while signing in.',
    INVALID_REQUEST: 'Invalid request.',
    NETWORK_ERROR: 'Cannot connect to the server. Check your internet.',
    SYNC_NOT_READY: 'Playlist synchronization is not enabled yet.',
    SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
    SESSION_EXPIRED_OR_INVALID: 'Send rejected: session expired or device license/sync not active. Sign out and sign in again; check key_ready in Supabase.'
  },

  sr: {
    INVALID_CREDENTIALS: 'Pogrešna MAC adresa ili PIN.',
    TOO_MANY_ATTEMPTS: 'Previše pokušaja. Pokušajte ponovo za 15 minuta.',
    SERVER_NOT_READY: 'Server još nije spreman.',
    SERVER_NOT_CONFIGURED: 'Nedostaje konfiguracija servera.',
    LOGIN_FAILED: 'Došlo je do greške pri prijavi.',
    INVALID_REQUEST: 'Neispravan zahtev.',
    NETWORK_ERROR: 'Nema veze sa serverom. Proverite internet.',
    SYNC_NOT_READY: 'Sinhronizacija plejlista još nije aktivirana.',
    SESSION_EXPIRED: 'Sesija je istekla. Prijavite se ponovo.',
    SESSION_EXPIRED_OR_INVALID: 'Slanje odbijeno: sesija je istekla ili licenca/sinhronizacija nije aktivna. Prijavite se ponovo i proverite key_ready.'
  }
};

function errorMessage(code) {
  return (messages[lang] || messages.en)[code] ||
    code ||
    messages.en.LOGIN_FAILED;
}

// TRANSLATIONS

function translate() {
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-t]').forEach(element => {
    element.textContent = t(element.dataset.t);
  });

  const footer = $('#foot');

  if (footer) {
    footer.textContent = t('footer');
  }
  renderDeviceInfo();
}

$('#lang').value = lang;

$('#lang').addEventListener('change', event => {
  lang = event.target.value;

  localStorage.setItem('luxPortalLang', lang);

  translate();
});

// DEVICE DETAILS — display only data returned by the authenticated server.
function renderDeviceInfo() {
  const trialValue = $('#trialValue');
  if (!trialValue) return;
  const info = deviceInfo || {};
  const dateFormat = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(lang === 'mk' ? 'mk-MK' : lang === 'sr' ? 'sr-RS' : 'en-GB') : null;
  };
  const trial = info.trial_expires_at || info.trialEndsAt || info.trial_expires_on;
  const license = info.license_expires_at || info.licenseEndsAt;
  const lifetime = info.is_lifetime === true || info.license_type === 'lifetime' || info.license_plan === 'lifetime';
  const trialDate = trial ? new Date(trial).getTime() : NaN;
  const licenseDate = license ? new Date(license).getTime() : NaN;
  const days = Number.isFinite(trialDate) ? Math.max(0, Math.ceil((trialDate - Date.now()) / 86400000)) : null;
  trialValue.textContent = days === null ? '—' : days === 0 ? t('expired') : `${days} ${t('daysLeft')}`;
  $('#trialDetail').textContent = days === null ? t('unknownData') : `${t('expiresOn')}: ${dateFormat(trial)}`;
  $('#licenseValue').textContent = lifetime ? t('lifetime') : Number.isFinite(licenseDate) ? (licenseDate > Date.now() ? t('active') : t('expired')) : '—';
  $('#licenseDetail').textContent = lifetime ? '∞' : Number.isFinite(licenseDate) ? `${t('expiresOn')}: ${dateFormat(license)}` : t('unknownData');
}

function setLoginLoading(active) {
  const overlay = $('#loginOverlay');
  if (overlay) overlay.classList.toggle('hidden', !active);
}

$('#copyMac')?.addEventListener('click', async () => {
  if (!device) return;
  try {
    await navigator.clipboard.writeText(device);
    const button = $('#copyMac');
    button.textContent = t('copied');
    setTimeout(() => { if (button.isConnected) button.textContent = t('copy'); }, 1500);
  } catch { /* Clipboard permission may be unavailable. */ }
});

// STATUS

function status(message, ok = false) {
  const element = $('#playlistStatus');

  if (!element) return;

  element.textContent = message;
  element.classList.toggle('ok', ok);
}

function loginStatus(message) {
  $('#loginStatus').textContent = message;
}

// API

async function api(action, extra = {}) {
  const url = action === 'send' ? window.LUXARY_SEND_API : window.LUXARY_DEVICE_API;

  if (!url || url.includes('YOUR_PROJECT')) {
    throw new Error(t('configure'));
  }

  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        ...extra
      })
    });

  } catch {
    throw new Error(errorMessage('NETWORK_ERROR'));
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      errorMessage(data.error || `HTTP ${response.status}`)
    );
  }

  return data;
}

// SESSION

function clearSession() {
  device = '';
  token = '';
  publicKey = null;
  deviceInfo = null;

  $('#dashboard').classList.add('hidden');
  $('#login').classList.remove('hidden');

  $('#pin').value = '';
  $('#playlistForm').reset();

  status('');
}

// ENCRYPTION

const b64 = bytes =>
  btoa(String.fromCharCode(...bytes));

async function encryptForDevice(message) {
  if (!publicKey) {
    throw new Error(errorMessage('SYNC_NOT_READY'));
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    publicKey,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    false,
    ['encrypt']
  );

  const aes = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt']
  );

  const rawKey = await crypto.subtle.exportKey('raw', aes);

  const wrapped = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    rawKey
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    aes,
    new TextEncoder().encode(JSON.stringify(message))
  );

  return JSON.stringify({
    v: 1,
    key: b64(new Uint8Array(wrapped)),
    iv: b64(iv),
    data: b64(new Uint8Array(encrypted))
  });
}


function updateLicenseInfo(result) {
  const trialStatus = $('#trialStatus');
  const trialExpiry = $('#trialExpiry');
  const subscriptionStatus = $('#subscriptionStatus');
  const subscriptionExpiry = $('#subscriptionExpiry');

  const trialEnd = result.trial_expires_at;
  const paidEnd = result.license_expires_at;

  const formatDate = value =>
    new Date(value).toLocaleDateString(
      lang === 'mk' ? 'mk-MK' :
      lang === 'sr' ? 'sr-RS' : 'en-GB'
    );

  if (trialEnd && !isNaN(Date.parse(trialEnd))) {
    const days = Math.max(
      0,
      Math.ceil((new Date(trialEnd) - Date.now()) / 86400000)
    );

    trialStatus.textContent =
      days > 0 ? `${days} days remaining` : 'Expired';

    trialExpiry.textContent =
      `Expires: ${formatDate(trialEnd)}`;
  } else {
    trialStatus.textContent = 'Not available';
    trialExpiry.textContent = 'Expires: —';
  }

  if (paidEnd && !isNaN(Date.parse(paidEnd))) {
    const active = new Date(paidEnd) > new Date();

    subscriptionStatus.textContent =
      active ? 'Active' : 'Expired';

    subscriptionExpiry.textContent =
      `Paid until: ${formatDate(paidEnd)}`;
  } else {
    subscriptionStatus.textContent = 'Not active';
    subscriptionExpiry.textContent = 'Paid until: —';
  }
}


// LOGIN

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();

  const mac = $('#mac').value.trim().toUpperCase();
  const pin = $('#pin').value.trim();

  if (
    !/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac) ||
    !/^[0-9]{8}$/.test(pin)
  ) {
    loginStatus(t('invalid'));
    return;
  }

  const button = event.submitter ||
    $('#loginForm').querySelector('button[type="submit"]');

  if (button) button.disabled = true;

  loginStatus('');
  setLoginLoading(true);

  try {
    const result = await api('login', {
      virtual_mac: mac,
      pin
    });

    if (!result.success || !result.session_token) {
      throw new Error(errorMessage('LOGIN_FAILED'));
    }

    device = mac;
    token = result.session_token;
    publicKey = result.publicKey || null;
    updateLicenseInfo(result);
    deviceInfo = result.device || result.device_info || result;
    renderDeviceInfo();

    $('#login').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');

    $('#deviceName').textContent = device;
    $('#pin').value = '';

    loginStatus('');

status('');

if (!publicKey) {
  showLuxToast(
    'error',
    'Synchronization unavailable',
    errorMessage('SYNC_NOT_READY')
  );
}

  } catch (error) {
    loginStatus(error.message);

  } finally {
    setLoginLoading(false);
    if (button) button.disabled = false;
  }
});

// LOGOUT

$('#logout').addEventListener('click', () => {
  clearSession();
  loginStatus('');
});

// URL VALIDATION

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);

    return (
      (parsed.protocol === 'http:' ||
       parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    );

  } catch {
    return false;
  }
}

// ADD PLAYLIST

$('#playlistForm').addEventListener('submit', async event => {
  event.preventDefault();

  if (!token) {
showLuxToast('error', 'LUXARY TV', errorMessage('SESSION_EXPIRED'));
    return;
  }

  if (!publicKey) {
showLuxToast('error', 'LUXARY TV', errorMessage('SYNC_NOT_READY'));
    return;
  }

  const name = $('#listName').value.trim();
  const url = $('#listUrl').value.trim();
  const epg = $('#epgUrl').value.trim();

  if (
    !name ||
    name.length > 45 ||
    !isValidHttpUrl(url) ||
    (epg && !isValidHttpUrl(epg))
  ) {
showLuxToast('error', 'LUXARY TV', t('invalidUrls'));
    return;
  }

  const button = event.submitter ||
    $('#playlistForm').querySelector('button[type="submit"]');

  if (button) button.disabled = true;

  try {
    const ciphertext = await encryptForDevice({
      action: 'add',
      name,
      url,
      epg
    });

    await api('send', {
      token,
      ciphertext
    });

status('');

showLuxToast(
  'success',
  lang === 'mk' ? 'Успешно испратено!' :
  lang === 'sr' ? 'Uspešno poslato!' :
  'Playlist sent successfully!',
  lang === 'mk'
    ? 'Плејлистата е безбедно испратена. Ќе се додаде кога твојот уред ќе биде онлајн.'
    : lang === 'sr'
    ? 'Plejlista je bezbedno poslata. Biće dodata kada uređaj bude na mreži.'
    : 'Your playlist was securely sent. It will be added when your device is online.'
);

event.target.reset();

} catch (error) {
  status('');

  showLuxToast(
    'error',
    lang === 'mk' ? 'Неуспешно испраќање' :
    lang === 'sr' ? 'Slanje nije uspelo' :
    'Unable to send playlist',
    error.message
  );

} finally {
  if (button) button.disabled = false;
}
});

// INITIALIZE

translate();


function showLuxToast(type, title, message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `lux-toast ${
    ["success", "error", "info"].includes(type) ? type : "info"
  }`;
  toast.setAttribute("role", "status");

  const icon = document.createElement("div");
  icon.className = "lux-toast-icon";
  icon.textContent =
    type === "success" ? "✓" :
    type === "error" ? "!" : "ℹ";

  const content = document.createElement("div");
  content.className = "lux-toast-content";

  const heading = document.createElement("div");
  heading.className = "lux-toast-title";
  heading.textContent = title;

  const description = document.createElement("div");
  description.className = "lux-toast-message";
  description.textContent = message;

  content.append(heading, description);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "lux-toast-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close notification");

  const progress = document.createElement("div");
  progress.className = "lux-toast-progress";

  toast.append(icon, content, close, progress);
  container.prepend(toast);

  function dismiss() {
    if (toast.classList.contains("hiding")) return;
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 250);
  }

  close.addEventListener("click", dismiss);
  setTimeout(dismiss, 5000);
}
