const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getFriendlyState, clearFriendlyState } = require('../../state/friendlyMatch.js');
const MatchModel = require('../../models/Match.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('friendly-end')
		.setDescription('Force-end your active friendly match.'),

	async execute(interaction) {
		const refUserId = interaction.user.id;
		const state = getFriendlyState(refUserId);

		if (!state) {
			await interaction.reply({
				content: '❌ You have no active friendly match.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await MatchModel.findByIdAndUpdate(state._id, {
			status: 'completed',
			completedAt: new Date(),
			winner: null,
		});

		clearFriendlyState(refUserId);

		await interaction.reply({
			content: `✅ Friendly between **${state.playerNames[0]}** and **${state.playerNames[1]}** has been ended.`,
			flags: MessageFlags.Ephemeral,
		});
	},
};
