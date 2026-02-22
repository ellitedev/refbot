const MatchModel = require('../models/Match.js');
const { getFriendliesEvent } = require('./event.js');

const friendlyStates = new Map();

function getFriendlyState(refUserId) {
	return friendlyStates.get(refUserId) ?? null;
}

function getAllFriendlyStates() {
	return friendlyStates;
}

function clearFriendlyState(refUserId) {
	friendlyStates.delete(refUserId);
}

async function initFriendlyMatch(refUserId, p1Name, p2Name, bestOf, mapPool, interaction) {
	const event = await getFriendliesEvent();

	const channelId = interaction.channel?.id ?? interaction.channelId;

	const matchNumber = (await MatchModel.countDocuments({ event: event._id })) + 1;

	const doc = await MatchModel.create({
		event: event._id,
		round: 'Friendly',
		matchNumber,
		player1: p1Name,
		player2: p2Name,
		player1DiscordId: null,
		player2DiscordId: null,
		score: [0, 0],
		bestOf,
		tier: 0,
		fullMapPool: [...mapPool],
		currentMapPool: [...mapPool],
		playedCharts: [],
		currentChart: null,
		currentPickerDiscordId: null,
		chartResults: [],
		status: 'in_progress',
		channelId,
	});

	const state = {
		_id: doc._id,
		refUserId,
		playerNames: [p1Name, p2Name],
		fullMapPool: [...mapPool],
		playedCharts: [],
		currentMapPool: [...mapPool],
		score: [0, 0],
		bestOf,
		winsNeeded: Math.ceil(bestOf / 2),
		currentChart: null,
		currentPicker: null,
		interaction,
		round: 'Friendly',
		matchNumber,
		hasBans: false,
	};

	friendlyStates.set(refUserId, state);
	return state;
}

async function saveFriendlyState(refUserId) {
	const state = friendlyStates.get(refUserId);
	if (!state) return;
	await MatchModel.findByIdAndUpdate(state._id, {
		score: state.score,
		currentMapPool: state.currentMapPool,
		playedCharts: state.playedCharts,
		currentChart: state.currentChart,
		currentPickerDiscordId: state.currentPicker ?? null,
	});
}

async function recordFriendlyChartResult(refUserId, chartResult) {
	const state = friendlyStates.get(refUserId);
	if (!state) return;
	await MatchModel.findByIdAndUpdate(state._id, {
		$push: { chartResults: chartResult },
	});
}

async function completeFriendlyMatch(refUserId, winnerName) {
	const state = friendlyStates.get(refUserId);
	if (!state) return;
	await MatchModel.findByIdAndUpdate(state._id, {
		score: state.score,
		winner: winnerName,
		status: 'completed',
		completedAt: new Date(),
	});
	friendlyStates.delete(refUserId);
}

module.exports = {
	getFriendlyState,
	getAllFriendlyStates,
	clearFriendlyState,
	initFriendlyMatch,
	saveFriendlyState,
	recordFriendlyChartResult,
	completeFriendlyMatch,
};
