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
			await broadcastMatchState('match.playerReady', state, {
				p1Ready,
				p2Ready,
			});
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
		time: 300000,
	});

	state._activeCollector = pickCol;

	pickCol.on('collect', async (i) => {
		if (i.user.id !== state.currentPicker.id) {
			await i.reply({
				content: `It's not your turn to pick! It's **${state.currentPicker.displayName || state.currentPicker.username}**'s turn.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			await i.deferUpdate();
			const picked = state.currentMapPool.find((m) => m.name === i.values[0]) ?? i.values[0];
			const pickedBy = state.currentPicker;
			state.currentChart = picked;

			// Stop the collector before broadcasting
			pickCol.stop();
			state._activeCollector = null;

			await broadcastMatchState('match.pick', state, {
				pickedByDiscordId: pickedBy.id,
			});

			await saveMatchState();
			await startReadyCheck(interaction, picked, state);
		}
		catch (error) {
			console.error('Error in pick phase:', error);
			await interaction.followUp({
				content: '❌ An error occurred during pick phase. A referee may need to restart.',
				flags: MessageFlags.Ephemeral,
			});
		}
	});

	pickCol.on('end', async (collected, reason) => {
		if (reason === 'time' && state._activeCollector === pickCol) {
			state._activeCollector = null;
			console.log('Pick phase timed out');

			// Notify that the pick timed out
			await interaction.followUp({
				content: '⚠️ Pick phase timed out. A referee needs to restart the match.',
				flags: MessageFlags.Ephemeral,
			});

			// Don't clear state automatically - let referee decide
		}
	});
}

async function startBanPhase(interaction, { player1, player2, mapPool, bestOf, tier, roundName, matchNumber }) {
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
		state.bannedCharts = [];
		state.currentBanner = banOrder[0];

		await broadcastMatchState('match.start', state);
		await broadcastMatchState('match.banOrderDecided', state, {
			firstBannerDiscordId: firstBanner.id,
		});

		await interaction.editReply({
			components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
			flags: MessageFlags.IsComponentsV2,
		});

		const banMessage = await interaction.fetchReply();

		const banSelectCol = banMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: (k) => k.customId === 'mapBan',
			time: 300000,
		});

		banSelectCol.on('end', async (collected, reason) => {
			if (reason === 'time' && state._activeCollector === banSelectCol) {
				state._activeCollector = null;
				console.log('Ban phase timed out');
				await interaction.followUp({
					content: '⚠️ Ban phase timed out. A referee needs to restart the match.',
					flags: MessageFlags.Ephemeral,
				});
			}
		});

		banSelectCol.on('collect', async (k) => {
			if (k.user.id !== banOrder[banTurn].id) {
				await k.reply({ content: 'It\'s not your turn to ban!', flags: MessageFlags.Ephemeral });
				return;
			}

			await k.deferUpdate();

			const bannedName = k.values[0];
			const banner = banOrder[banTurn];
			state.bannedCharts = [...(state.bannedCharts ?? []), { name: bannedName, bannedBy: banner.id }];

			currentMapPool = currentMapPool.filter((m) => m.name !== bannedName);
			banTurn++;

			state.currentMapPool = [...currentMapPool];
			state.currentBanner = banOrder[banTurn] ?? null;

			if (currentMapPool.length <= 1) {
				banSelectCol.stop();
				await saveMatchState();
				await broadcastMatchState('match.ban', state, {
					bannedChart: bannedName,
					bannedByDiscordId: banner.id,
				});
				await broadcastMatchState('match.pickPhaseStart', state);

				await interaction.editReply({
					components: [getPickContainer(firstBanner, currentMapPool, state.score, state.playerNames, bestOf)],
					flags: MessageFlags.IsComponentsV2,
				});

				const pickMessage = await interaction.fetchReply();
				startPickPhase(interaction, pickMessage, state);
				return;
			}

			await broadcastMatchState('match.ban', state, {
				bannedChart: bannedName,
				bannedByDiscordId: banner.id,
			});

			await interaction.editReply({
				components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});
		});
	});
}

module.exports = { startPickPhase, startBanPhase };
