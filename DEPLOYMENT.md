# One Brain Deployment Guide

## Frontend (Vercel)
The frontend is deployed as a Single Page Application (SPA) on Vercel.

**Required Environment Variables (Vercel):**
- `VITE_SOCKET_URL`: URL to your Render backend (e.g., `https://one-brain-backend.onrender.com`)
- `VITE_PUBLIC_URL`: URL to your Vercel frontend (e.g., `https://one-brain.vercel.app`)

*Note: The `vercel.json` file ensures that all routes (like `/join/:code`) correctly serve `index.html`.*

## Backend (Render)
The backend is a Node.js Express & Socket.IO server hosted on Render as a Web Service.

**Required Environment Variables (Render):**
- `CLIENT_URL`: URL to your Vercel frontend (e.g., `https://one-brain.vercel.app`). Used for CORS.
- `ADMIN_PASSWORD`: A secure password for accessing admin endpoints.
- `PORT`: (Render typically sets this automatically, but if defining it, defaults to `3001`).

**Build & Run Commands (Render):**
- Build Command: `npm install`
- Start Command: `node index.js`

*Note: The server allows WebSocket and Polling transports, and responds to a `/health` check.*
