const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, MessageFlags, Collection } = require('discord.js');
require('dotenv').config({ quiet: true });

const BOT_TOKEN = process.env.NODE_ENV === 'development'
	? (process.env.TEST_TOKEN || process.env.DISCORD_TOKEN)
	: process.env.DISCORD_TOKEN;
// eslint-disable-next-line no-unused-vars
const APP_CLIENT_ID = process.env.NODE_ENV === 'development'
	? (process.env.TEST_ID || process.env.CLIENT_ID)
	: process.env.CLIENT_ID;
const { connectDB } = require('./state/db.js');
const { loadActiveEvent, getActiveEvent } = require('./state/event.js');
const { loadMapPoolFromDB } = require('./state/mapPool.js');
const { loadGeneratedPoolsFromDB } = require('./state/generatedPools.js');
const { loadInProgressMatch, getMatchState } = require('./state/match.js');
const { resumeMatch } = require('./util/resumeMatch.js');
const { startWebSocketServer } = require('./state/ws.js');
const { startHttpServer } = require('./state/http.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (readyClient) => {
	console.log('Ready! Logged in as', readyClient.user.tag);

	startWebSocketServer();
	startHttpServer();
	await connectDB();
	await loadActiveEvent();

	const event = getActiveEvent();
	if (event) {
		console.log(`Active event: ${event.name}`);
		await loadMapPoolFromDB();
		await loadGeneratedPoolsFromDB();

		const inProgress = await loadInProgressMatch();
		if (inProgress) {
			console.log(`⚠️  Found in-progress match (${inProgress.meta.round} #${inProgress.meta.matchNumber}) — attempting auto-resume...`);
			const resumed = await resumeMatch(readyClient, inProgress, getMatchState() ?? {});
			if (!resumed) {
				console.error('[resume] Auto-resume failed. A referee may need to intervene manually.');
			}
		}
	}
	else {
		console.log('No active event. Use /event create to get started.');
	}
});

client.login(BOT_TOKEN);

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isAutocomplete()) {
		const command = interaction.client.commands.get(interaction.commandName);
		if (!command?.autocomplete) return;
		try {
			await command.autocomplete(interaction);
		}
		catch (error) {
			console.error(error);
		}
		return;
	}

	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
		else {
			await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
	}
});
