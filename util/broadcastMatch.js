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

	broadcast(event, {
		round: state.round,
		matchNumber: state.matchNumber,
		players: [
			{ name: state.playerNames[0], discordId: state.player1?.id },
			{ name: state.playerNames[1], discordId: state.player2?.id },
		],
		score: state.score,
		bestOf: state.bestOf,
		winsNeeded: state.winsNeeded,
		currentChart: currentChartData,
		currentMapPool: poolWithData,
		playedCharts: state.playedCharts,
		currentPickerDiscordId: state.currentPicker?.id ?? null,
		...extra,
	});
}

module.exports = { broadcastMatchState, getChartData };
