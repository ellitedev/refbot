# SpinShare Speen Open Referee Bot
A Discord bot to help referees manage matches more easily!

## Setup

### Prerequisites
- Node.js v24+
- A Discord bot application with a token
- A MongoDB instance

### Installation
1. Clone the repository
2. Run `npm i` in the root directory
3. Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=tokenhere
CLIENT_ID=discordbotapplicationidhere
GUILD_ID=serveridhere
```

### Running
- `npm run deploy` — registers slash commands with Discord (run this whenever you add or change commands)
- `npm run dev` — runs the bot in development mode with auto-restart on file changes
- `npm start` — runs the bot in production mode

## Features
- **/start** — starts a match, handling:
  - player check-in via dropdown
  - referee approval
  - random ban order selection
  - alternating ban phase until one map remains
- **/ping** — replies with Pong!
- **/server** — displays server info
- **/user** — displays user info

## TO-DO
In no order:
- [x] Handle pick/ban cycle
- [x] Mappool generation/management
- [x] Ready checks
- [ ] MongoDB match state persistence
- [ ] Save mappool in MongoDB
- [ ] start.gg match reporting
- [ ] Websocket match reporting
