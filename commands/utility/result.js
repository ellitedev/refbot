const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getMatchState, recordChartResult, completeMatch, saveMatchState } = require('../../state/match.js');
const { getPickContainer, getWinnerContainer } = require('../../ui/matchContainers.js');
const { startPickPhase } = require('../../util/matchFlow.js');
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

		const p1Won = score1 > score2;
		const winner = p1Won ? state.player1 : state.player2;
		const winnerName = p1Won ? state.playerNames[0] : state.playerNames[1];

		if (p1Won) state.score[0]++;
		else state.score[1]++;

		const chart = state.currentChart;
		state.currentChart = null;
		state.playedCharts.push(chart);
		state.currentMapPool = state.fullMapPool.filter((m) => !state.playedCharts.includes(m));

		await recordChartResult({
			chart,
			score1,
			score2,
			fc1,
			fc2,
			pfc1,
			pfc2,
			winner: winnerName,
		});

		await broadcastMatchState('match.chartResult', state, {
			chart,
			score1,
			score2,
			fc1,
			fc2,
			pfc1,
			pfc2,
			winner: winnerName,
		});

		const scoreStr = [
			'```',
			`Chart Results: ${chart}`,
			'',
			`${state.playerNames[0]} | ${fcLabel(score1, fc1, pfc1)}`,
			`${state.playerNames[1]} | ${fcLabel(score2, fc2, pfc2)}`,
			`${winnerName} wins the chart!`,
			'',
			'Match score:',
			`${state.playerNames[0]} | ${state.score[0]} - ${state.score[1]} | ${state.playerNames[1]}`,
			'```',
		].join('\n');

		const matchOver = state.score[0] >= state.winsNeeded || state.score[1] >= state.winsNeeded;

		await interaction.reply({ content: scoreStr, flags: MessageFlags.Ephemeral });

		if (matchOver) {
			await broadcastMatchState('match.end', state, { winner: winnerName });
			await completeMatch(winnerName);
			await state.interaction.editReply({
				content: '',
				components: [getWinnerContainer(winner, state.score, state.playerNames, state.bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});
			return;
		}

		state.currentPicker = winner;
		await saveMatchState();
		await broadcastMatchState('match.pick', state);

		await state.interaction.editReply({
			content: '',
			components: [getPickContainer(winner, state.currentMapPool, state.score, state.playerNames, state.bestOf)],
			flags: MessageFlags.IsComponentsV2,
		});

		const pickMessage = await state.interaction.fetchReply();
		startPickPhase(state.interaction, pickMessage, state);
	},
};
