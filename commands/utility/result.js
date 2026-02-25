const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getMatchState, submitResult } = require('../../state/match.js');
const { getPickContainer, getWinnerContainer } = require('../../ui/matchContainers.js');
const { startPickPhase, getCurrentPool, getScore, getPlayerNames } = require('../../util/matchFlow.js');
const { broadcastMatchState } = require('../../util/broadcastMatch.js');
const { requireReferee } = require('../../util/requireReferee.js');

function fcLabel(score, fc, pfc) {
	if (pfc) return `${score} [PFC]`;
	if (fc) return `${score} [FC]`;
	return `${score}`;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('result')
		.setDescription('Submit the result of the current chart.')
		.addIntegerOption((o) => o.setName('score1').setDescription('Score for Player 1').setRequired(true))
		.addIntegerOption((o) => o.setName('score2').setDescription('Score for Player 2').setRequired(true))
		.addBooleanOption((o) => o.setName('fc1').setDescription('Did Player 1 FC?').setRequired(true))
		.addBooleanOption((o) => o.setName('fc2').setDescription('Did Player 2 FC?').setRequired(true))
		.addBooleanOption((o) => o.setName('pfc1').setDescription('Did Player 1 PFC?'))
		.addBooleanOption((o) => o.setName('pfc2').setDescription('Did Player 2 PFC?')),

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const state = getMatchState();

		if (!state) {
			await interaction.reply({ content: 'No match is currently in progress.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!state.currentChart) {
			await interaction.reply({ content: 'No chart is currently being played.', flags: MessageFlags.Ephemeral });
			return;
		}

		const score1 = interaction.options.getInteger('score1');
		const score2 = interaction.options.getInteger('score2');
		const fc1 = interaction.options.getBoolean('fc1');
		const fc2 = interaction.options.getBoolean('fc2');
		const pfc1 = interaction.options.getBoolean('pfc1') ?? false;
		const pfc2 = interaction.options.getBoolean('pfc2') ?? false;

		const csvName = state.currentChart;
		const entry = state.mappool.find(c => c.csvName === csvName);
		const chartDisplayName = entry?.displayName ?? csvName;

		const { winner } = await submitResult({ csvName, score1, score2, fc1, fc2, pfc1, pfc2 });
		const updatedState = getMatchState();

		const p1 = updatedState.players[0];
		const p2 = updatedState.players[1];

		const scoreStr = [
			'```',
			`Chart Results: ${chartDisplayName}`,
			'',
			`${p1.displayName} | ${fcLabel(score1, fc1, pfc1)}`,
			`${p2.displayName} | ${fcLabel(score2, fc2, pfc2)}`,
			`${winner ? winner.displayName : (score1 > score2 ? p1.displayName : p2.displayName)} wins the chart!`,
			'',
			'Match score:',
			`${p1.displayName} | ${p1.points} - ${p2.points} | ${p2.displayName}`,
			'```',
		].join('\n');

		await interaction.reply({ content: scoreStr, flags: MessageFlags.Ephemeral });

		if (winner) {
			await broadcastMatchState('match.end', updatedState);
			const winnerDiscordUser = state._discordUsersMap?.get(winner.discordId);
			await state._interaction.editReply({
				content: '',
				components: [getWinnerContainer(winnerDiscordUser ?? { username: winner.displayName }, getScore(updatedState), getPlayerNames(updatedState), updatedState.meta.bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});
			return;
		}

		await broadcastMatchState('match.chartResult', updatedState);

		const currentPool = getCurrentPool(updatedState);
		const nextPickerDiscordId = updatedState.currentPickerDiscordId;
		const nextPickerDiscordUser = state._discordUsersMap?.get(nextPickerDiscordId);

		await state._interaction.editReply({
			content: '',
			components: [getPickContainer(nextPickerDiscordUser, currentPool, getScore(updatedState), getPlayerNames(updatedState), updatedState.meta.bestOf)],
			flags: MessageFlags.IsComponentsV2,
		});

		const pickMessage = await state._interaction.fetchReply();
		startPickPhase(state.interaction, pickMessage, updatedState, state._discordUsersMap);
	},
};
