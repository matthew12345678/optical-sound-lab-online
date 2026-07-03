# Optical Film Sound Lab

Web app that reads video frames optically and turns brightness, scanlines, edges, and grain into sound.

## Run locally

Node 18+ is required (use `nvm use 24` if your default Node is old):

```bash
cd "/Users/puta/Desktop/newfilm maker"
nvm use 24   # or any Node >= 18
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

A production build is in `dist/` after `npm run build` — serve it with `npm run preview`.

## Usage

1. Click **Load Film** and choose a video (or image-backed clip).
2. Pick a **Reading Mode** and adjust scan position, frequency, and sensitivity.
3. Click **Play** — audio starts after a user gesture (browser requirement).
4. Use **Film Position** to scrub the timeline. **Record** captures **160×120** preview + synced audio; **Stop** ends playback or saves the recording.

## Build for production

```bash
npm run build
npm run preview
```
