# SkyGuard AI — Hosting Guide

For a highly dynamic hackathon project containing a PyTorch-based machine learning backend and a real-time React dashboard, we recommend decoupling the hosting into two platforms: **Vercel** for the frontend and **Render** (or Railway/DigitalOcean) for the backend.

*(Note: We have just updated the codebase to support production environment variables `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` to make this hosting setup seamless).*

---

## 1. Hosting the Backend (FastAPI + PyTorch)

Because your backend uses PyTorch (which requires memory) and WebSockets (which requires persistent connections), serverless platforms like Vercel Functions or AWS Lambda will **not** work. You need a persistent container.

**Recommended Free/Cheap Platforms:**
- **Render.com** (Free Web Service tier available)
- **Railway.app** (Great Docker support)

### Steps for Render:
1. Create a free account on [Render](https://render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select the `SIH26073-Team-Kestrel` repository.
4. Configure the Web Service:
   - **Root Directory:** `server`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Click **Create Web Service**. 
6. Render will build and deploy your backend. It may take 5-10 minutes (PyTorch is a large dependency).
7. Once deployed, copy your backend URL (e.g., `https://skyguard-backend.onrender.com`).

---

## 2. Hosting the Frontend (React + Vite)

The frontend is completely static and can be deployed for free on Vercel or Netlify.

### Steps for Vercel:
1. Create a free account on [Vercel](https://vercel.com).
2. Click **Add New Project**.
3. Connect your GitHub account and select the `SIH26073-Team-Kestrel` repository.
4. Configure the Project:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend/skyguard-qc`
5. **Set Environment Variables:**
   Expand the "Environment Variables" section and add the URLs pointing to your deployed Render backend:
   - `VITE_API_BASE_URL` = `https://skyguard-backend.onrender.com`
   - `VITE_WS_BASE_URL` = `wss://skyguard-backend.onrender.com` *(Note: use `wss://` for secure WebSockets)*
6. Click **Deploy**.
7. Vercel will automatically build (`npm run build`) and deploy your frontend.

---

## 3. Success!

Your full-stack application is now live. 
- Vercel automatically sets up CI/CD, so anytime you push to GitHub, the frontend updates.
- Render automatically re-deploys your backend whenever you push changes to the `server/` directory.

### Troubleshooting (CORS)
The backend `main.py` is already configured with `allow_origins=["*"]`, meaning it will automatically accept cross-origin requests from your Vercel URL without any extra configuration.
