const { broadcast } = require('../state/ws.js');
const ChartModel = require('../models/Chart.js');

async function getChartData(chartName, songId) {
	if (!chartName && !songId) return null;

	const doc = songId
		? await ChartModel.findOne({ songId })
		: await ChartModel.findOne({ csvName: chartName });

	if (!doc) return { displayName: chartName ?? String(songId) };

	return {
		songId: doc.songId,
		title: doc.title,
		artist: doc.artist,
		charter: doc.charter,
		cover: doc.cover,
		thumbnailUrl: doc.thumbnailUrl,
		difficulty: doc.difficulty,
		tags: doc.tags,
		displayName: `${doc.title} - ${doc.charter}`,
		csvName: doc.csvName,
	};
}

function getPlayerData(user, name) {
	if (!user) return { name: name ?? null, discordId: null, username: null, displayName: null, avatar: null };
	return {
		name,
		discordId: user.id,
		username: user.username ?? null,
		displayName: user.displayName ?? user.username ?? null,
		avatar: user.displayAvatarURL({ size: 128, extension: 'png' }) ?? null,
	};
}

async function broadcastMatchState(event, state, extra = {}) {
	const chart = state.currentChart;
	const chartName = typeof chart === 'string' ? chart : (chart?.name ?? null);
	const chartSongId = typeof chart === 'string' ? null : (chart?.songId ?? null);
	const currentChartData = chartName || chartSongId
		? await getChartData(chartName, chartSongId)
		: null;

	const poolWithData = await Promise.all(
		(state.currentMapPool ?? []).map(async (entry) => {
			const name = typeof entry === 'string' ? entry : entry.name;
			const songId = typeof entry === 'string' ? null : (entry.songId ?? null);
			const data = await getChartData(name, songId);
			return data ?? { displayName: name };
		}),
	);

	const fullPoolWithData = await Promise.all(
		(state.fullMapPool ?? []).map(async (entry) => {
			const name = typeof entry === 'string' ? entry : entry.name;
			const songId = typeof entry === 'string' ? null : (entry.songId ?? null);
			const data = await getChartData(name, songId);
			return data ?? { displayName: name };
		}),
	);

	broadcast(event, {
		round: state.round,
		matchNumber: state.matchNumber,
		players: [
			getPlayerData(state.player1, state.playerNames[0]),
			getPlayerData(state.player2, state.playerNames[1]),
		],
		score: state.score,
		bestOf: state.bestOf,
		winsNeeded: state.winsNeeded,
		currentChart: currentChartData,
		currentMapPool: poolWithData,
		fullMapPool: fullPoolWithData,
		playedCharts: state.playedCharts,
		bannedCharts: state.bannedCharts ?? [],
		currentPicker: getPlayerData(state.currentPicker, state.currentPicker
			? (state.player1?.id === state.currentPicker.id ? state.playerNames[0] : state.playerNames[1])
			: null),
		currentBanner: getPlayerData(state.currentBanner, state.currentBanner
			? (state.player1?.id === state.currentBanner.id ? state.playerNames[0] : state.playerNames[1])
			: null),
		...extra,
	});
}

module.exports = { broadcastMatchState, getChartData, getPlayerData };
