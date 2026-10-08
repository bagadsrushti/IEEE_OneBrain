# One Brain - Deployment Guide

## Prerequisites
- A Vercel account (for the frontend)
- A Render account (for the backend)
- GitHub account (to host the repository)

## Step 1: Backend Deployment (Render)

1. Push your repository to GitHub.
2. Log into Render (render.com) and click **New > Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service:
   - **Name**: `one-brain-backend`
   - **Environment**: Node
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
5. **Environment Variables**:
   - `ADMIN_PASSWORD`: A secure password for the admin panel.
   - `PORT`: (Render sets this automatically, but you can set to 3001).
6. Click **Create Web Service**. Wait for the deployment to finish and copy the generated URL (e.g., `https://one-brain-backend.onrender.com`).

## Step 2: Frontend Deployment (Vercel)

1. Log into Vercel (vercel.com) and click **Add New > Project**.
2. Import your GitHub repository.
3. Configure the Project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**:
   - `VITE_BACKEND_URL`: Paste the Render URL from Step 1 (e.g., `https://one-brain-backend.onrender.com`).
5. Click **Deploy**. Vercel will build and host your PWA.

## Step 3: PWA Manifest (Optional but recommended for mobile-first)
Ensure your `vite.config.js` is set up with `vite-plugin-pwa` if you want it to be fully installable offline, or simply add a `manifest.json` in the `public` folder and reference it in `index.html`.

## Local Development
1. Start Backend:
   ```bash
   cd backend
   npm run dev (or node index.js)
   ```
2. Start Frontend:
   ```bash
   cd frontend
   npm run dev
   ```
