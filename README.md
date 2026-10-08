# One Brain

A real-time multiplayer web game for live college events. Players join a room, each receives a distinct clue, and they must communicate in person to guess the hidden answer before time runs out!

## Tech Stack
- Frontend: React + Vite + Tailwind CSS (Mobile-first PWA)
- Backend: Node.js + Express + Socket.IO

## Features
- Scalable real-time rooms
- Dynamic difficulty mapping (more players = harder challenge)
- Global Leaderboard
- Admin Panel
- QR Code joining

## Getting Started

### Backend
1. `cd backend`
2. `npm install`
3. Create a `.env` file based on `.env.example`
4. `npm run dev` or `node index.js`

### Frontend
1. `cd frontend`
2. `npm install`
3. Create a `.env` file based on `.env.example`
4. `npm run dev`

### Validation
Run the validation script to check your custom challenges:
```bash
node backend/utils/validateChallenges.js
```

### Load Testing
Run the load test to simulate 50 concurrent rooms:
```bash
node backend/loadTest.js
```

## Deployment
See `DEPLOYMENT.md` for detailed instructions on deploying to Render and Vercel.
