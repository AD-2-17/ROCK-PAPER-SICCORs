# Deployment Guide

This project consists of a React (Vite) frontend and an Express (Socket.IO + SQLite) backend. 

## Deploying the Frontend to Vercel

The frontend is fully configured to be deployed on **Vercel**. 
We have included a `vercel.json` file that automatically configures the Vite build and Single Page Application (SPA) routing.

### Steps to deploy frontend:
1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and click **Add New... > Project**.
3. Import this GitHub repository.
4. Open the **Environment Variables** section in Vercel.
5. Add a new variable:
   - **Key**: `VITE_SOCKET_URL`
   - **Value**: *(The URL of your deployed backend, e.g., `https://my-dog-of-war-backend.onrender.com`)*
6. Click **Deploy**.

*(If you don't add the `VITE_SOCKET_URL` variable, the app will try to connect to the backend on the same domain, which only works if both are hosted together).*

---

## Deploying the Backend

**Important Note:** You **cannot** deploy the backend part of this app (Express + Socket.IO + SQLite) on Vercel. 
Vercel uses "Serverless Functions" which are ephemeral and do not support:
- Long-lived WebSocket connections (Socket.IO).
- A persistent local file system (needed for SQLite `better-sqlite3`).

### Recommended Backend Hosts:
To deploy the backend, we highly recommend using a VPS or a container-based Platform-as-a-Service like **Render**, **Railway**, or **Fly.io**.

**How to deploy on Render (Example):**
1. Create a new "Web Service" on [Render.com](https://render.com).
2. Connect this same GitHub repository.
3. **Build Command**: `npm install`
4. **Start Command**: `npm run dev:server` (or change this in package.json to just `node server/index.js`)
5. **Environment Variables**:
   - `JWT_SECRET` = (generate a random string)
   - `PORT` = (Render sets this automatically, but you can set it)
6. Add a **Disk** to the service mounted at `/data` and change the SQLite path in `server/db.js` to `/data/database.sqlite` so your database is not wiped on every deploy.
