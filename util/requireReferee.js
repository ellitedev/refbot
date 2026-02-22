const { MessageFlags } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

async function requireReferee(interaction) {
	const config = await GuildConfig.findOne({ guildId: interaction.guildId });

	if (!config?.refereeRoleId) {
		await interaction.reply({
			content: '❌ This server has not configured a referee role yet. An administrator must run `/config set-referee-role` first.',
			flags: MessageFlags.Ephemeral,
		});
		return false;
	}

	if (!interaction.member.roles.cache.has(config.refereeRoleId)) {
		await interaction.reply({
			content: '❌ You need the referee role to use this command.',
			flags: MessageFlags.Ephemeral,
		});
		return false;
	}

	return true;
}

module.exports = { requireReferee };
