const { REST, Routes } = require('discord.js');
require('dotenv').config({ quiet: true });

const TOKEN = process.env.NODE_ENV === 'development'
	? (process.env.TEST_TOKEN || process.env.DISCORD_TOKEN)
	: process.env.DISCORD_TOKEN;
const APP_CLIENT_ID = process.env.NODE_ENV === 'development'
	? (process.env.TEST_ID || process.env.CLIENT_ID)
	: process.env.CLIENT_ID;
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const rest = new REST().setToken(TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Sanity-check: attempt to resolve which application id the token belongs to.
		let currentAppId = APP_CLIENT_ID;
		try {
			const app = await rest.get(Routes.oauth2CurrentApplication());
			if (app?.id) {
				currentAppId = app.id;
				console.log(`Token corresponds to application id: ${currentAppId}`);
				if (currentAppId !== APP_CLIENT_ID) {
					console.warn(`APP_CLIENT_ID (${APP_CLIENT_ID}) does not match token's application id (${currentAppId}). Using token's app id for deployment.`);
				}
			}
		}
		catch {
			console.warn('Could not fetch application info from token; token may be invalid or lack oauth2 access. Continuing with APP_CLIENT_ID.');
		}

		const guildIds = process.env.GUILD_IDS.split(',');

		const successes = [];
		const failures = [];

		for (const guildId of guildIds) {
			try {
				const data = await rest.put(Routes.applicationGuildCommands(currentAppId, guildId), { body: commands });
				console.log(`Successfully reloaded ${data.length} application (/) commands in guild ${guildId}.`);
				successes.push({ guildId, count: Array.isArray(data) ? data.length : (data?.length ?? 0) });
			}
			catch (err) {
				const isMissingAccess = err?.code === 50001 || err?.status === 403;
				console.error(`Failed to reload commands for guild ${guildId} (app ${currentAppId}).`);
				if (isMissingAccess) {
					console.error('Missing Access (403). The app likely is not invited to that guild.');
					console.error(`Invite the app: https://discord.com/oauth2/authorize?client_id=${currentAppId}&scope=applications.commands%20bot&permissions=8`);
				}
				// Print a concise single-line error (avoid dumping stack/objects unless verbose)
				console.error(`  ${err?.name || 'Error'}: ${err?.message || String(err)}${err?.status ? ` (status ${err.status})` : ''}${err?.code ? ` (code ${err.code})` : ''}`);
				failures.push({ guildId, reason: isMissingAccess ? 'Missing Access (403)' : (err?.message || String(err)) });
			}
		}

		// Summary
		console.log('--- Deployment summary ---');
		console.log(`Succeeded: ${successes.length}`);
		if (successes.length) {
			console.log(successes.map(s => `  - ${s.guildId} (${s.count} commands)`).join('\n'));
		}
		console.log(`Failed: ${failures.length}`);
		if (failures.length) {
			console.log(failures.map(f => `  - ${f.guildId}: ${f.reason}`).join('\n'));
		}
	}
	catch (error) {
		console.error(error);
	}
})();