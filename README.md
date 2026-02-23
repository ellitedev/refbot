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
MONGODB_URI=mongodb://USERNAME:PASSWORD@URL:PORT
WS_PORT=websocketporthere
```

### Running
- `npm run deploy` - registers slash commands with Discord (run this whenever you add or change commands)
- `npm run dev` - runs the bot in development mode with auto-restart on file changes
- `npm start` - runs the bot in production mode

## Features
- **/start** - starts a match, handling:
  - player check-in via dropdown
  - referee approval
  - random ban order selection
  - alternating ban phase until one map remains
- **/restart** - restarts a previously completed match with the same map pool
- **/result** - submits the result of the current chart
- **/clean** - cleans up stuck or abandoned matches
- **/refresh** - fetches the map pool from a Google Sheets URL and caches SpinShare chart data
- **/generate** - generates all match pools for the tournament (maybe integrate this into `/refresh` instead?)
- **/event** - creates, switches, and lists events
- **/ping** - replies with "Pong!" and how long the command took to execute.
- **/hostname** - replies with hostname of current environment

## TO-DO
In no order:
- [x] Handle pick/ban cycle
- [x] Mappool generation/management
- [x] Ready checks
- [x] MongoDB match state persistence
- [x] Save mappool in MongoDB
- [x] WebSocket match reporting
- [x] SpinShare chart metadata + album art
- [x] Match history and restart support
- [x] Permission checks, only people with a certain role should be allowed to run certain events and commands, might need a complete re-write.
- [x] Support for friendly's, outside of tournament play. (This means we need to be able to run concurrent matches)
- [ ] start.gg match reporting
- [ ] fetch event data from start.gg, rather than using brackets.json and hardcoding things
- [ ] Simulate rolls because it's silly and fun! Should be interactive for the players
