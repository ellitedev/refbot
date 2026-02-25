const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getMatchState, resetMatchState } = require('../../state/match.js');
const MatchModel = require('../../models/Match.js');
const { requireReferee } = require('../../util/requireReferee.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('forceclean')
		.setDescription('Force clean a stuck match from memory')
		.addBooleanOption(option =>
			option.setName('confirm')
				.setDescription('Confirm you want to force clean the match')
				.setRequired(true)),

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const confirm = interaction.options.getBoolean('confirm');

		if (!confirm) {
			await interaction.reply({
				content: '❌ Force clean cancelled. This command forcefully clears the match state from memory.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const currentMatch = getMatchState();

		let message = '**Force Clean Results:**\n\n';

		// Clear in-memory state
		if (currentMatch) {
			resetMatchState();
			message += '✅ Cleared match state from memory\n';
		}
		else {
			message += 'ℹ️ No match state found in memory\n';
		}

		// Also check for any stuck in-progress matches in database
		const stuckMatches = await MatchModel.find({
			status: 'in_progress',
		}).limit(5);

		if (stuckMatches.length > 0) {
			message += `\n⚠️ Found ${stuckMatches.length} stuck match(es) in database:\n`;
			for (const match of stuckMatches) {
				message += `- ${match.round} #${match.matchNumber} (${match.player1} vs ${match.player2})\n`;
			}
			message += '\nUse `/clean` to clean up database matches if needed.';
		}
		else {
			message += '\n✅ No stuck matches found in database';
		}

		await interaction.reply({
			content: message,
			flags: MessageFlags.Ephemeral,
		});
	},
};