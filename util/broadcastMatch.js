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

function broadcastMatchState(event, state, extra = {}) {
	if (!state) return;

	broadcast(event, {
		progressLevel: state.progressLevel,
		meta: state.meta,
		players: state.players,
		mappool: state.mappool,
		banPhase: state.banPhase,
		currentPickerDiscordId: state.currentPickerDiscordId,
		currentChart: state.currentChart,
		feed: state.feed,
		...extra,
	});
}

module.exports = { broadcastMatchState, getChartData };
