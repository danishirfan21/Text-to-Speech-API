/*
 * Front‑end logic for the Text‑to‑Speech service.
 *
 * This script controls authentication (register/login/logout),
 * retrieves available voices from the API and populates dropdowns,
 * and handles synthesis of text into audio. Audio results are
 * presented in the UI and offered for download.
 */

// Base URL of the TTS API. Modify this value to point to your backend.
const API_BASE_URL = 'http://localhost:3000/api';

// Cached voices grouped by language
let voicesByLang = {};

// --- Helper functions ---

/**
 * Perform a fetch request with automatic Authorization header if a
 * token is stored in localStorage. Handles JSON and non‑JSON
 * responses.
 *
 * @param {string} path Endpoint path relative to API_BASE_URL
 * @param {object} options Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} Fetch Response object
 */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      mode: 'cors',
      ...options,
      headers,
    });
    return response;
  } catch (err) {
    console.log("==========err", err)
    // Handle CORS/network errors by returning a custom error-like object
    return {
      ok: false,
      status: 0,
      statusText: 'CORS or Network Error',
      json: async () => ({ error: 'CORS or network error. Please check backend CORS settings and network connectivity.' }),
      text: async () => 'CORS or network error. Please check backend CORS settings and network connectivity.'
    };
  }
}

/**
 * Show an HTML element by removing the `hidden` class.
 * @param {HTMLElement} el
 */
function showElement(el) {
  el.classList.remove('hidden');
}

/**
 * Hide an HTML element by adding the `hidden` class.
 * @param {HTMLElement} el
 */
function hideElement(el) {
  el.classList.add('hidden');
}

/**
 * Populate the language and voice dropdowns using voicesByLang.
 */
function populateVoiceDropdowns() {
  const languageSelect = document.getElementById('language-select');
  const voiceSelect = document.getElementById('voice-select');
  // Clear existing options
  languageSelect.innerHTML = '';
  voiceSelect.innerHTML = '';
  // Populate languages
  const languages = Object.keys(voicesByLang).sort();
  languages.forEach((lang) => {
    const option = document.createElement('option');
    option.value = lang;
    option.textContent = lang;
    languageSelect.appendChild(option);
  });
  // Populate voices based on the first language
  if (languages.length > 0) {
    updateVoiceOptions(languages[0]);
  }
  // When language changes, update voices
  languageSelect.addEventListener('change', (e) => {
    updateVoiceOptions(e.target.value);
  });
}

/**
 * Update the voice dropdown for a selected language.
 * @param {string} languageCode Language code (e.g., "en-US")
 */
function updateVoiceOptions(languageCode) {
  const voiceSelect = document.getElementById('voice-select');
  voiceSelect.innerHTML = '';
  const voices = voicesByLang[languageCode] || [];
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.ssmlGender})`;
    voiceSelect.appendChild(option);
  });
}

/**
 * Display the authenticated user's email in the nav bar.
 */
function updateUserNav() {
  const userNav = document.getElementById('user-nav');
  const emailSpan = document.getElementById('user-email');
  const token = localStorage.getItem('accessToken');
  if (!token) {
    hideElement(userNav);
    return;
  }
  // Fetch current user info
  apiFetch('/auth/me')
    .then((res) => res.json())
    .then((data) => {
      if (data && data.user && data.user.email) {
        emailSpan.textContent = data.user.email;
      } else {
        emailSpan.textContent = '';
      }
    })
    .catch(() => {
      emailSpan.textContent = '';
    });
  showElement(userNav);
}

// --- Authentication handlers ---

function initAuthHandlers() {
  const loginFormContainer = document.getElementById('login-form');
  const registerFormContainer = document.getElementById('register-form');
  const loginForm = loginFormContainer.querySelector('form');
  const registerForm = registerFormContainer.querySelector('form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const showRegisterLink = document.getElementById('show-register');
  const showLoginLink = document.getElementById('show-login');

  // Switch between login and register forms
  showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    hideElement(loginFormContainer);
    showElement(registerFormContainer);
  });
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    hideElement(registerFormContainer);
    showElement(loginFormContainer);
  });

  // Login submission handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      loginError.textContent = 'Email and password are required.';
      return;
    }
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        loginError.textContent = errorData?.error || errorData?.message || 'Login failed';
        return;
      }
      const data = await response.json();
      localStorage.setItem('accessToken', data.tokens.accessToken);
      // After login, hide auth section and show synthesis
      hideElement(document.getElementById('auth-section'));
      showElement(document.getElementById('synth-section'));
      updateUserNav();
      await loadVoices();
    } catch (err) {
      loginError.textContent = 'Network error. Please try again.';
    }
  });

  // Registration submission handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
  registerError.textContent = '';
  hideElement(registerError);
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const tier = document.getElementById('register-tier').value;
    if (!email || !password) {
      registerError.textContent = 'Email and password are required.';
      showElement(registerError);
      return;
    }
    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, tier }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Show all validation errors if present
        if (Array.isArray(result?.details) && result.details.length > 0) {
          registerError.innerHTML = result.details.map(e => `<div>${e.msg}</div>`).join('');
        } else {
          registerError.textContent = result?.error || result?.message || 'Registration failed';
        }
        showElement(registerError);
        return;
      }
      // Auto login after registration
      localStorage.setItem('accessToken', result.tokens.accessToken);
      hideElement(document.getElementById('auth-section'));
      showElement(document.getElementById('synth-section'));
      updateUserNav();
      await loadVoices();
    } catch (err) {
      registerError.textContent = 'Network error. Please try again.';
      showElement(registerError);
    }
    if (!registerError.textContent) {
      hideElement(registerError);
    }
  });
}

// --- Voice loading ---

/**
 * Fetch the available voices from the API and populate the dropdowns.
 */
async function loadVoices() {
  try {
    const response = await apiFetch('/tts/voices');
    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }
    const data = await response.json();
    voicesByLang = data.voices || {};
    populateVoiceDropdowns();
  } catch (err) {
    console.error('Error loading voices:', err);
  }
}

// --- Synthesis handler ---

function initSynthesisHandler() {
  const synthForm = document.getElementById('synth-form');
  const synthError = document.getElementById('synth-error');
  const synthResult = document.getElementById('synth-result');
  const audioPlayer = document.getElementById('audio-player');
  const downloadLink = document.getElementById('download-link');
  const synthButton = synthForm.querySelector('button[type="submit"]');

  synthForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    synthError.textContent = '';
    hideElement(synthError);
    hideElement(synthResult);
    synthButton.disabled = true;
    synthButton.textContent = 'Synthesizing...';

    // Gather input values
    const text = document.getElementById('synth-text').value.trim();
    if (!text) {
      synthError.textContent = 'Please enter text to synthesize.';
      showElement(synthError);
      return;
    }
    const languageCode = document.getElementById('language-select').value;
    const voiceName = document.getElementById('voice-select').value;
    const audioEncoding = document.getElementById('audio-format').value;
    const speakingRate = parseFloat(
      document.getElementById('speaking-rate').value || '1.0'
    );
    const pitch = parseFloat(document.getElementById('pitch').value || '0');
    const volumeGainDb = parseFloat(
      document.getElementById('volume-gain').value || '0'
    );
    const asyncFlag = document.getElementById('async-checkbox').checked;
    const streamingFlag = document.getElementById('streaming-checkbox').checked;

    // Build request body
    const payload = {
      text,
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding,
        speakingRate,
        pitch,
        volumeGainDb,
      },
      async: asyncFlag,
      streaming: streamingFlag,
    };
    try {
      const response = await apiFetch('/tts/synthesize', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        // Try to parse error message
        const errorData = await response.json().catch(() => ({}));
        synthError.textContent = errorData?.error || errorData?.message || 'Synthesis failed';
        showElement(synthError);
        return;
      }
      // If async, show status
      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        if (result.status === 'accepted' && result.jobId) {
          synthError.textContent = `Job accepted. Check status at ${result.statusUrl} and download at ${result.downloadUrl}.`;
        } else {
          synthError.textContent = result.message || 'Unexpected response.';
        }
        showElement(synthError);
        return;
      }
      // Otherwise treat response as binary audio
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioPlayer.src = url;
      downloadLink.href = url;
      downloadLink.download = `synthesis.${audioEncoding.toLowerCase()}`;
      showElement(synthResult);
    } catch (err) {
      synthError.textContent = 'Network error. Please try again.';
      showElement(synthError);
    } finally {
      if (!synthError.textContent) {
        hideElement(synthError);
      }
      synthButton.disabled = false;
      synthButton.textContent = 'Synthesize';
    }
  });
}

// --- Logout handler ---
function initLogoutHandler() {
  const logoutBtn = document.getElementById('logout-button');
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('accessToken');
    // Reset UI
    hideElement(document.getElementById('synth-section'));
    showElement(document.getElementById('auth-section'));
    hideElement(document.getElementById('user-nav'));
  });
}

// --- Initialization on page load ---
document.addEventListener('DOMContentLoaded', async () => {
  initAuthHandlers();
  initSynthesisHandler();
  initLogoutHandler();
  const token = localStorage.getItem('accessToken');
  if (token) {
    // Already logged in
    hideElement(document.getElementById('auth-section'));
    showElement(document.getElementById('synth-section'));
    updateUserNav();
    await loadVoices();
  } else {
    // Not authenticated
    showElement(document.getElementById('auth-section'));
    hideElement(document.getElementById('synth-section'));
  }
});