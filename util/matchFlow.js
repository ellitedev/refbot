const { ComponentType } = require('discord.js');
const { MessageFlags } = require('discord.js');
const {
	initMatchState,
	banChart,
	pickChart,
	setPlayerReady,
	saveMatchState,
	getMatchState,
} = require('../state/match.js');
const { broadcastMatchState } = require('./broadcastMatch.js');
const {
	getBanOrderContainer,
	getBanContainer,
	getPickContainer,
	getReadyCheckContainer,
	getCountdownContainer,
} = require('../ui/matchContainers.js');

function chartDisplayName(entry) {
	if (typeof entry === 'string') return entry;
	return entry.displayName ?? entry.csvName ?? entry.name ?? '?';
}

function chartId(entry) {
	if (typeof entry === 'string') return entry;
	return entry.csvName ?? entry.name ?? '?';
}

function getScore(state) {
	return [state.players[0].points, state.players[1].points];
}

function getPlayerNames(state) {
	return [state.players[0].displayName, state.players[1].displayName];
}

function getCurrentPool(state) {
	if (state.progressLevel === 'ban-phase' || state.progressLevel === 'ready-check') {
		return state.mappool.filter(c => !c.status.banned && !c.status.played);
	}
	return state.mappool.filter(c => !c.status.played);
}

function getPlayerByDiscordId(state, discordId) {
	return state.players.find(p => p.discordId === discordId) ?? null;
}

function getDiscordUserFromState(state, slot, discordUsersMap) {
	const player = state.players[slot - 1];
	return discordUsersMap.get(player.discordId) ?? null;
}

async function startReadyCheck(interaction, message, csvName, state, discordUsersMap) {
	const entry = state.mappool.find(c => c.csvName === csvName);
	const coverUrl = entry?.thumbnailUrl ?? entry?.cover ?? null;
	const chart = entry ?? { csvName, displayName: csvName };

	const p1DiscordUser = discordUsersMap.get(state.players[0].discordId);
	const p2DiscordUser = discordUsersMap.get(state.players[1].discordId);

	const readied = new Set();

	await message.edit({
		components: [getReadyCheckContainer(chart, p1DiscordUser, p2DiscordUser, false, false, true, null, coverUrl)],
		flags: MessageFlags.IsComponentsV2,
	});

	const readyCol = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (j) => (j.user.id === state.players[0].discordId || j.user.id === state.players[1].discordId) && j.customId === 'ready',
		time: 300000,
	});

	state._activeCollector = readyCol;

	readyCol.on('collect', async (j) => {
		if (readied.has(j.user.id)) {
			await j.reply({ content: 'You\'re already ready!', flags: MessageFlags.Ephemeral });
			return;
		}

		readied.add(j.user.id);
		await j.deferUpdate();

		const allReady = await setPlayerReady(j.user.id);
		const updatedState = getMatchState();
		const p1Ready = updatedState.players[0].ready;
		const p2Ready = updatedState.players[1].ready;

		if (allReady) {
			readyCol.stop();
			state._activeCollector = null;

			// CRITICAL FIX: Update progress level to 'playing'
			updatedState.progressLevel = 'playing';
			await saveMatchState();

			await broadcastMatchState('match.chartStart', updatedState);
			await message.edit({
				components: [getCountdownContainer(chart, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		else {
			const unreadyDiscordUser = !p1Ready ? p1DiscordUser : p2DiscordUser;
			await broadcastMatchState('match.playerReady', updatedState);
			await message.edit({
				components: [getReadyCheckContainer(chart, p1DiscordUser, p2DiscordUser, p1Ready, p2Ready, false, unreadyDiscordUser, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	});

	readyCol.on('end', async (collected, reason) => {
		if (reason === 'time' && state._activeCollector === readyCol) {
			state._activeCollector = null;
			await interaction.followUp({
				content: '⚠️ Ready check timed out. A referee needs to restart the match.',
				flags: MessageFlags.Ephemeral,
			});
		}
	});
}

async function startPickPhase(interaction, message, state, discordUsersMap = new Map()) {
	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

	const currentPool = getCurrentPool(state);

	if (currentPool.length === 1) {
		const chart = currentPool[0];
		await pickChart(chart.csvName, state.currentPickerDiscordId);
		const updatedState = getMatchState();
		await broadcastMatchState('match.pick', updatedState);
		await startReadyCheck(interaction, message, chart.csvName, updatedState, discordUsersMap);
		return;
	}

	const pickerDiscordId = state.currentPickerDiscordId;
	const pickerPlayer = getPlayerByDiscordId(state, pickerDiscordId);
	const pickerDisplayData = {
		username: pickerPlayer?.discordUsername ?? 'Unknown',
		displayName: pickerPlayer?.discordDisplayName ?? pickerPlayer?.displayName ?? 'Unknown Player',
		id: pickerDiscordId,
	};

	const pickCol = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: (i) => i.customId === 'mapSelect',
		time: 300000,
	});

	state._activeCollector = pickCol;

	pickCol.on('collect', async (i) => {
		if (i.user.id !== pickerDiscordId) {
			await i.reply({
				content: `It's not your turn to pick! It's **${pickerDisplayData.displayName}**'s turn.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			await i.deferUpdate();
			const csvName = i.values[0];

			pickCol.stop();
			state._activeCollector = null;

			await pickChart(csvName, i.user.id);
			const updatedState = getMatchState();

			await broadcastMatchState('match.pick', updatedState, { pickedByDiscordId: i.user.id });
			await startReadyCheck(interaction, message, csvName, updatedState, discordUsersMap);
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
			await interaction.followUp({
				content: '⚠️ Pick phase timed out. A referee needs to restart the match.',
				flags: MessageFlags.Ephemeral,
			});
		}
	});
}

async function startBanPhase(interaction, { player1, player2, player1Name, player2Name, mapPool, bestOf, tier, roundName, matchNumber }, discordUsersMap) {
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

		const state = await initMatchState({
			player1,
			player2,
			player1Name,
			player2Name,
			firstBanner,
			bestOf,
			tier,
			mapPool,
			interaction,
			round: roundName,
			matchNumber,
		});

		state._interaction = interaction;
		discordUsersMap.set(player1.id, player1);
		discordUsersMap.set(player2.id, player2);
		state._discordUsersMap = discordUsersMap;

		await broadcastMatchState('match.start', state);
		await broadcastMatchState('match.banOrderDecided', state, {
			firstBannerDiscordId: firstBanner.id,
		});

		const currentPool = getCurrentPool(state);
		const currentBannerDiscordUser = discordUsersMap.get(state.banPhase.currentBannerDiscordId);

		await interaction.editReply({
			components: [getBanContainer(currentBannerDiscordUser, currentPool, getScore(state), getPlayerNames(state), bestOf)],
			flags: MessageFlags.IsComponentsV2,
		});

		const banMessage = await interaction.fetchReply();

		const banSelectCol = banMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: (k) => k.customId === 'mapBan',
			time: 300000,
		});

		state._activeCollector = banSelectCol;

		banSelectCol.on('end', async (collected, reason) => {
			if (reason === 'time' && state._activeCollector === banSelectCol) {
				state._activeCollector = null;
				await interaction.followUp({
					content: '⚠️ Ban phase timed out. A referee needs to restart the match.',
					flags: MessageFlags.Ephemeral,
				});
			}
		});

		banSelectCol.on('collect', async (k) => {
			const currentState = getMatchState();
			if (k.user.id !== currentState.banPhase.currentBannerDiscordId) {
				await k.reply({ content: 'It\'s not your turn to ban!', flags: MessageFlags.Ephemeral });
				return;
			}

			await k.deferUpdate();

			const bannedName = k.values[0];
			await banChart(bannedName, k.user.id);
			const updatedState = getMatchState();
			const updatedPool = getCurrentPool(updatedState);

			if (updatedPool.length <= 1) {
				banSelectCol.stop();
				state._activeCollector = null;

				await broadcastMatchState('match.ban', updatedState, {
					bannedChart: bannedName,
					bannedByDiscordId: k.user.id,
				});

				const firstChart = updatedPool[0];

				// Set up the chart but DON'T set progressLevel to 'playing' yet
				await pickChart(firstChart.csvName, k.user.id);
				const updatedStateAfterPick = getMatchState();

				// CRITICAL: Set to 'ready-check', NOT 'playing'
				updatedStateAfterPick.progressLevel = 'ready-check';

				if (!updatedStateAfterPick.playedCharts) {
					updatedStateAfterPick.playedCharts = [];
				}

				await saveMatchState();

				await broadcastMatchState('match.firstChartDetermined', updatedStateAfterPick, {
					chart: firstChart.csvName,
				});

				const message = await interaction.fetchReply();
				await startReadyCheck(interaction, message, firstChart.csvName, updatedStateAfterPick, discordUsersMap);
				return;
			}

			await broadcastMatchState('match.ban', updatedState, {
				bannedChart: bannedName,
				bannedByDiscordId: k.user.id,
			});

			const nextBannerDiscordUser = discordUsersMap.get(updatedState.banPhase.currentBannerDiscordId);
			await interaction.editReply({
				components: [getBanContainer(nextBannerDiscordUser, updatedPool, getScore(updatedState), getPlayerNames(updatedState), bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});
		});
	});
}

module.exports = {
	startPickPhase,
	startBanPhase,
	startReadyCheck,
	getCurrentPool,
	getScore,
	getPlayerNames,
	getPlayerByDiscordId,
};
