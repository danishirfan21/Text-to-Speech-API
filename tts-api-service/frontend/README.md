# Text‑to‑Speech Front‑End

This front‑end provides a simple, responsive user interface for interacting with the **Text‑to‑Speech API Service**.  It is intended as a companion to the back‑end API defined in the `tts-api-service` directory of this repository.  With this UI you can register a new account, authenticate, browse available voices and synthesize your own audio recordings.

## ✨ Features

- **Registration & Login**: Create a new user account or sign in with existing credentials.  JSON Web Tokens (JWTs) are stored in `localStorage` for subsequent requests.
- **Voice Selection**: Retrieve the full list of supported languages and voices from the `/api/tts/voices` endpoint and choose your preferred combination.
- **Customizable Synthesis**: Configure audio encoding (MP3, WAV, OGG), speaking rate, pitch and volume.  You can also opt for asynchronous or streaming synthesis.
- **Audio Preview & Download**: For synchronous synthesis requests, the generated audio is played directly in the browser and offered as a downloadable file.
- **Responsive Design**: The layout adapts gracefully to different screen sizes and devices without relying on external CSS frameworks.

## 🚀 Getting Started

1. Ensure the API service is running locally at `http://localhost:3000`.  You may modify the `API_BASE_URL` constant in `script.js` if your back‑end runs on a different host or port.
2. Serve the contents of the `tts-frontend` directory with any static file server.  For example, using Python:

   ```bash
   cd tts-frontend
   python3 -m http.server 8080
   ```

   Then open `http://localhost:8080` in your browser.

3. Register a new user, log in, and start synthesizing!

## 🧩 Structure

- **`index.html`** – Defines the markup for login/registration and synthesis forms.
- **`style.css`** – Contains modern, lightweight CSS to style the interface.  No third‑party frameworks required.
- **`script.js`** – Implements the client logic: authentication flow, voice loading, synthesis requests and UI state management.
- **`README.md`** – This documentation file.

Feel free to extend this front‑end with additional features such as displaying synthesis history, monitoring asynchronous job status, or improving styling.  The code is intentionally kept straightforward to make customization easy.