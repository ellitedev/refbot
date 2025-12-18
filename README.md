# SpinShare Speen Open Referee Bot
Simple discord bot to help Referees do their job more easily!

## Contributing
To get started, please run install Node v25.2.1. I suggest using NVM (Node Version Manager) to install it.

Then, run `npm i` in the root directory, let npm install dependencies, and you *should* be ready to go!

Make sure to create a `.env` file in the root directory, and put this in it:
```env
DISCORD_TOKEN=tokenhere
CLIENT_ID=discordbotapplicationidhere
GUILD_ID=serveridhere
```

## TO-DO
In no order:
- [ ] Manage start.gg matches (report data)
- [ ] Generate/manage mappools (maybe ask Ricki)
- [ ] Handle pick/ban cycle
- [ ] Handle ready checks
- [ ] Report match information (mappool, pick ban cycle, ready status) through websocket or something?
- [ ] more?
