const { SlashCommandBuilder } = require('discord.js');
const os = require('os');

module.exports = {
	data: new SlashCommandBuilder().setName('hostname').setDescription('Replies current hostname'),
	async execute(interaction) {
		try {
			const hostname = os.hostname();
			interaction.reply({ content: `The hostname of my environment is ${hostname}`, withResponse: true });
		}
		catch {
			interaction.reply({ content: 'Error: Unable to retrieve hostname', withResponse: true });
		}
	},
};