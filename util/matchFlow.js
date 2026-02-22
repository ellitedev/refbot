const { MessageFlags, ComponentType } = require('discord.js');
const { getReadyCheckContainer, getCountdownContainer } = require('../ui/matchContainers.js');
const { broadcastMatchState } = require('./broadcastMatch.js');
const ChartModel = require('../models/Chart.js');

async function getCoverUrl(chartName) {
	if (!chartName) return null;
	try {
		const doc = await ChartModel.findOne({ csvName: chartName });
		return doc?.cover ?? null;
	}
	catch {
		return null;
	}
}

async function startReadyCheck(interaction, chart, state) {
	let p1Ready = false;
	let p2Ready = false;

	const coverUrl = await getCoverUrl(chart);

	const readyMsg = await interaction.editReply({
		components: [getReadyCheckContainer(chart, state.player1, state.player2, p1Ready, p2Ready, true, null, coverUrl)],
		flags: MessageFlags.IsComponentsV2,
	});

	const readyCol = readyMsg.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (j) => j.user.id === state.player1.id || j.user.id === state.player2.id,
	});

	readyCol.on('collect', async (j) => {
		if (j.user.id === state.player1.id && !p1Ready) p1Ready = true;
		else if (j.user.id === state.player2.id && !p2Ready) p2Ready = true;
		else {
			await j.reply({ content: 'You\'re already ready!', flags: MessageFlags.Ephemeral });
			return;
		}

		await j.deferUpdate();

		if (p1Ready && p2Ready) {
			readyCol.stop();
			state.currentChart = chart;
			await broadcastMatchState('match.chartStart', state);
			await interaction.editReply({
				components: [getCountdownContainer(chart, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		else {
			const unreadyPlayer = !p1Ready ? state.player1 : state.player2;
			await interaction.editReply({
				components: [getReadyCheckContainer(chart, state.player1, state.player2, p1Ready, p2Ready, false, unreadyPlayer, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	});
}

async function startPickPhase(interaction, message, state) {
	if (state.currentMapPool.length === 1) {
		const chart = state.currentMapPool[0];
		state.currentChart = chart;
		await broadcastMatchState('match.chartStart', state);
		await startReadyCheck(interaction, chart, state);
		return;
	}

	const pickCol = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: (i) => i.customId === 'mapSelect',
	});

	pickCol.on('collect', async (i) => {
		if (i.user.id !== state.currentPicker.id) {
			await i.reply({ content: 'It\'s not your turn to pick!', flags: MessageFlags.Ephemeral });
			return;
		}

		await i.deferUpdate();
		const picked = i.values[0];
		state.currentChart = picked;
		await broadcastMatchState('match.pick', state);
		pickCol.stop();

		await startReadyCheck(interaction, picked, state);
	});
}

module.exports = { startPickPhase };
