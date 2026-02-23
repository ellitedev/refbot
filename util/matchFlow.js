const { MessageFlags, ComponentType } = require('discord.js');
const { getReadyCheckContainer, getCountdownContainer, getBanOrderContainer, getBanContainer, getPickContainer } = require('../ui/matchContainers.js');
const { broadcastMatchState } = require('./broadcastMatch.js');
const { initMatchState, saveMatchState } = require('../state/match.js');
const ChartModel = require('../models/Chart.js');

async function getCoverUrl(chart) {
	if (!chart) return null;
	try {
		const songId = typeof chart === 'string' ? null : (chart.songId ?? null);
		const name = typeof chart === 'string' ? chart : chart.name;
		const doc = songId
			? await ChartModel.findOne({ songId })
			: await ChartModel.findOne({ csvName: name });
		return doc?.cover ?? null;
	}
	catch {
		return null;
	}
}

async function startReadyCheck(interaction, chart, state) {
	let p1Ready = false;
	let p2Ready = false;

	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

	const coverUrl = await getCoverUrl(chart);

	const readyMsg = await interaction.editReply({
		components: [getReadyCheckContainer(chart, state.player1, state.player2, p1Ready, p2Ready, true, null, coverUrl)],
		flags: MessageFlags.IsComponentsV2,
	});

	const readied = new Set();

	const readyCol = readyMsg.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (j) => j.customId === 'ready',
		max: 2,
	});

	state._activeCollector = readyCol;

	readyCol.on('collect', async (j) => {
		if (j.user.id !== state.player1.id && j.user.id !== state.player2.id) {
			await j.reply({ content: 'You are not a player in this match!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (readied.has(j.user.id)) {
			await j.reply({ content: 'You\'re already ready!', flags: MessageFlags.Ephemeral });
			return;
		}

		readied.add(j.user.id);
		await j.deferUpdate();

		if (j.user.id === state.player1.id) p1Ready = true;
		else p2Ready = true;

		if (p1Ready && p2Ready) {
			readyCol.stop();
			state._activeCollector = null;
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
	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

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
		max: 1,
	});

	state._activeCollector = pickCol;

	pickCol.on('collect', async (i) => {
		if (i.user.id !== state.currentPicker.id) {
			await i.reply({ content: 'It\'s not your turn to pick!', flags: MessageFlags.Ephemeral });
			return;
		}

		await i.deferUpdate();
		const picked = state.currentMapPool.find((m) => m.name === i.values[0]) ?? i.values[0];
		state.currentChart = picked;
		await broadcastMatchState('match.pick', state);
		pickCol.stop();
		state._activeCollector = null;

		await startReadyCheck(interaction, picked, state);
	});
}

async function startBanPhase(interaction, { player1, player2, mapPool, bestOf, tier, roundName, matchNumber, onReject }) {
	const randomPlayer = Math.random() >= 0.5 ? player1 : player2;
	const otherPlayer = randomPlayer !== player1 ? player1 : player2;

	const banOrderMsg = await interaction.editReply({
		components: [getBanOrderContainer(randomPlayer)],
		flags: MessageFlags.IsComponentsV2,
		withResponse: true,
	});

	const banOrderCol = banOrderMsg.createMessageComponentCollector({
		filter: (j) => j.user.id === randomPlayer.id,
		componentType: ComponentType.Button,
		max: 1,
	});

	banOrderCol.on('collect', async (j) => {
		await j.deferUpdate();

		const firstBanner = j.customId === 'first' ? randomPlayer : otherPlayer;
		const secondBanner = firstBanner === randomPlayer ? otherPlayer : randomPlayer;
		const numBans = mapPool.length - 1;
		const banOrder = Array.from({ length: numBans }, (_, i) => (i % 2 === 0 ? firstBanner : secondBanner));
		let currentMapPool = [...mapPool];
		let banTurn = 0;

		const state = await initMatchState(player1, player2, firstBanner, bestOf, tier, currentMapPool, interaction, roundName, matchNumber);
		await broadcastMatchState('match.start', state);

		await interaction.editReply({
			components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
			flags: MessageFlags.IsComponentsV2,
		});

		const banMessage = await interaction.fetchReply();

		const banSelectCol = banMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: (k) => k.customId === 'mapBan',
		});

		banSelectCol.on('collect', async (k) => {
			if (k.user.id !== banOrder[banTurn].id) {
				await k.reply({ content: 'It\'s not your turn to ban!', flags: MessageFlags.Ephemeral });
				return;
			}

			await k.deferUpdate();
			currentMapPool = currentMapPool.filter((m) => m.name !== k.values[0]);
			banTurn++;

			if (currentMapPool.length <= 1) {
				banSelectCol.stop();
				state.currentMapPool = [...currentMapPool];
				await saveMatchState();
				await broadcastMatchState('match.pickPhaseStart', state);

				await interaction.editReply({
					components: [getPickContainer(firstBanner, currentMapPool, state.score, state.playerNames, bestOf)],
					flags: MessageFlags.IsComponentsV2,
				});

				const pickMessage = await interaction.fetchReply();
				startPickPhase(interaction, pickMessage, state);
				return;
			}

			await interaction.editReply({
				components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});
		});
	});
}

module.exports = { startPickPhase, startBanPhase };
