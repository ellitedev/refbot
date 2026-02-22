const MatchModel = require('../models/Match.js');
const { getActiveEvent } = require('./event.js');

const players = ['Player 1', 'Player 2'];

let matchState = null;

function getMatchState() {
	return matchState;
}

function resetMatchState() {
	matchState = null;
}

function getMatchStateRef() {
	if (!matchState) matchState = {};
	return matchState;
}

async function initMatchState(p1, p2, firstPicker, bestOf, tier, mapPool, interaction, round, matchNumber) {
	const event = getActiveEvent();
	if (!event) throw new Error('No active event!');

	const channelId = interaction.channel?.id ?? interaction.channelId;

	const doc = await MatchModel.create({
		event: event._id,
		round,
		matchNumber,
		player1: players[0],
		player2: players[1],
		player1DiscordId: p1.id,
		player2DiscordId: p2.id,
		score: [0, 0],
		bestOf,
		tier,
		fullMapPool: [...mapPool],
		currentMapPool: [...mapPool],
		playedCharts: [],
		currentChart: null,
		currentPickerDiscordId: firstPicker.id,
		chartResults: [],
		status: 'in_progress',
		channelId,
	});

	matchState = {
		_id: doc._id,
		player1: p1,
		player2: p2,
		playerNames: [players[0], players[1]],
		fullMapPool: [...mapPool],
		playedCharts: [],
		currentMapPool: [...mapPool],
		score: [0, 0],
		bestOf,
		tier,
		winsNeeded: Math.ceil(bestOf / 2),
		currentPicker: firstPicker,
		currentChart: null,
		interaction,
		round,
		matchNumber,
	};

	return matchState;
}

async function saveMatchState() {
	if (!matchState) return;
	await MatchModel.findByIdAndUpdate(matchState._id, {
		score: matchState.score,
		currentMapPool: matchState.currentMapPool,
		playedCharts: matchState.playedCharts,
		currentChart: matchState.currentChart,
		currentPickerDiscordId: matchState.currentPicker?.id ?? null,
	});
}

async function recordChartResult(chartResult) {
	if (!matchState) return;
	await MatchModel.findByIdAndUpdate(matchState._id, {
		$push: { chartResults: chartResult },
	});
}

async function completeMatch(winnerName) {
	if (!matchState) return;
	await MatchModel.findByIdAndUpdate(matchState._id, {
		score: matchState.score,
		winner: winnerName,
		status: 'completed',
		completedAt: new Date(),
	});
	matchState = null;
}

async function loadInProgressMatch() {
	const event = getActiveEvent();
	if (!event) return null;
	return MatchModel.findOne({ event: event._id, status: 'in_progress' });
}

module.exports = {
	players,
	getMatchState,
	resetMatchState,
	getMatchStateRef,
	initMatchState,
	saveMatchState,
	recordChartResult,
	completeMatch,
	loadInProgressMatch,
};
