# SpendMate – Daily Spending Tracker (Web)

A React + Vite + Tailwind app to track daily spending, budgets, loans, and credit cards. Ready for Netlify.

## Run locally
```bash
npm install
npm run dev
# open http://localhost:5173
```

## Build
```bash
npm run build
# output in /dist
```

## Deploy to Netlify
### Option A: Connect to GitHub
1. Push this folder to a new GitHub repo.
2. On Netlify, **New site from Git** → pick your repo.
3. Build command: `npm run build` ; Publish directory: `dist`.
4. Deploy.

### Option B: Drag & Drop
1. Build locally (`npm run build`).
2. Zip the **dist/** folder.
3. On Netlify → **Deploys** → **Drag and drop your site** → drop the `dist.zip`.
4. Get your public URL immediately.

## Notes
- All data is stored locally in the browser (LocalStorage). For cloud sync, add an API (Azure Functions) and database later.
