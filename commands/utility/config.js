const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('config')
		.setDescription('Configure the bot for this server.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName('set-referee-role')
				.setDescription('Set the role that is allowed to run referee commands.')
				.addRoleOption((o) =>
					o.setName('role').setDescription('The referee role').setRequired(true),
				),
		),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();

		if (sub === 'set-referee-role') {
			const role = interaction.options.getRole('role');

			await GuildConfig.findOneAndUpdate(
				{ guildId: interaction.guildId },
				{ refereeRoleId: role.id },
				{ upsert: true, new: true },
			);

			await interaction.reply({
				content: `✅ Referee role set to <@&${role.id}>.`,
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
