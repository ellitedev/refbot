const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('commands')
		.setDescription('Lists all available commands.'),

	async execute(interaction) {
		const foldersPath = path.join(__dirname, '..');
		const commandFolders = fs.readdirSync(foldersPath);

		const embed = new EmbedBuilder()
			.setTitle('Available Commands')
			.setColor(0x5865f2);

		for (const folder of commandFolders) {
			const commandsPath = path.join(foldersPath, folder);
			if (!fs.statSync(commandsPath).isDirectory()) continue;

			const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
			const lines = [];

			for (const file of commandFiles) {
				const command = require(path.join(commandsPath, file));
				if (!command?.data) continue;

				const cmd = command.data;
				const subcommands = cmd.options?.filter((o) => o.toJSON?.().type === 1);

				if (subcommands?.length) {
					for (const sub of subcommands) {
						const j = sub.toJSON();
						lines.push(`\`/${cmd.name} ${j.name}\` - ${j.description}`);
					}
				}
				else {
					lines.push(`\`/${cmd.name}\` - ${cmd.description}`);
				}
			}

			if (lines.length) {
				embed.addFields({ name: folder, value: lines.join('\n') });
			}
		}

		await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	},
};
