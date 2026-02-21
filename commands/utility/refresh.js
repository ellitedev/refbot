const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { fetchMapPool, getCacheInfo } = require('../../state/mapPool.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('refresh')
		.setDescription('Refresh the map pool from a Google Sheets URL.')
		.addStringOption((o) =>
			o.setName('url').setDescription('Google Sheets URL').setRequired(true),
		),

	async execute(interaction) {
		const url = interaction.options.getString('url');
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const pools = await fetchMapPool(url);
			const counts = Object.entries(pools)
				.map(([tier, maps]) => `Tier ${tier}: ${maps.length} maps`)
				.join('\n');

			await interaction.editReply({
				content: `✅ Map pool refreshed!\n\`\`\`\n${counts}\n\`\`\``,
			});
		}
		catch (err) {
			await interaction.editReply({ content: `❌ Failed to refresh map pool: ${err.message}` });
		}
	},
};
