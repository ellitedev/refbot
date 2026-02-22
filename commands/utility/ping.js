const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder().setName('ping').setDescription('Replies with \'Pong!\''),
	async execute(interaction) {
		const { resource } = await interaction.reply({ content: 'Pong!', withResponse: true });
		const latency = resource.message.createdTimestamp - interaction.createdTimestamp;
		await interaction.editReply(`Pong! ${latency}ms`);
	},
};