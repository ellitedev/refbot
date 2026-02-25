const MatchModel = require('../models/Match.js');
const { getFriendliesEvent } = require('./event.js');
const { getChartData } = require('../util/broadcastMatch.js');
const { broadcast } = require('./ws.js');

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

async function buildFriendlyMappoolEntry(chart) {
	const csvName = typeof chart === 'string' ? chart : (chart.csvName ?? chart.name ?? chart.title);
	const songId = typeof chart === 'object' ? (chart.songId ?? null) : null;
	const chartData = (typeof chart === 'object' && chart.title) ? chart : await getChartData(csvName, songId);

	return {
		songId: chartData?.songId ?? songId ?? null,
		csvName,
		title: chartData?.title ?? null,
		artist: chartData?.artist ?? null,
		charter: chartData?.charter ?? null,
		cover: chartData?.cover ?? null,
		thumbnailUrl: chartData?.thumbnailUrl ?? null,
		difficulty: chartData?.difficulty ?? null,
		tags: chartData?.tags ?? [],
		displayName: chartData?.displayName ?? chartData?.title ?? csvName,
		status: {
			banned: false,
			bannedByDiscordId: null,
			bannedAt: null,
			played: false,
			playedAt: null,
			inCurrentPool: true,
			isBeingPlayed: false,
		},
		result: null,
	};
}

function buildFriendlyPlayerEntry(slot, name) {
	return {
		slot,
		displayName: name,
		discordId: null,
		discordUsername: null,
		discordDisplayName: null,
		avatarUrl: null,
		points: 0,
		ready: false,
		winner: false,
	};
}

function broadcastFriendlyState(event, state, extra = {}) {
	if (!state) return;
	broadcast(event, {
		isFriendly: true,
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

function pushFriendlyFeed(state, type, message, data = {}) {
	state.feed.push({
		type,
		timestamp: new Date().toISOString(),
		message: message ?? null,
		data,
	});
}

async function initFriendlyMatch(refUserId, p1Name, p2Name, bestOf, mapPool, interaction) {
	const event = await getFriendliesEvent();
	const channelId = interaction.channel?.id ?? interaction.channelId;
	const matchNumber = (await MatchModel.countDocuments({ 'meta.eventId': event._id })) + 1;
	const winsNeeded = Math.ceil(bestOf / 2);

	const builtMappool = await Promise.all(mapPool.map(buildFriendlyMappoolEntry));

	const state = {
		_id: null,
		refUserId,
		progressLevel: 'playing',
		meta: {
			name: `Friendly - Match ${matchNumber}`,
			round: 'Friendly',
			matchNumber,
			bestOf,
			winsNeeded,
			tier: null,
			channelId,
			eventId: event._id,
			startedAt: new Date().toISOString(),
			completedAt: null,
		},
		players: [
			buildFriendlyPlayerEntry(1, p1Name),
			buildFriendlyPlayerEntry(2, p2Name),
		],
		mappool: builtMappool,
		banPhase: {
			banOrder: [],
			currentBannerDiscordId: null,
			bansCompleted: 0,
			totalBans: 0,
		},
		currentPickerDiscordId: null,
		currentChart: null,
		feed: [],
		status: 'in_progress',
		hasBans: false,
		interaction,
		publicMessage: null,
		_activeCollector: null,
	};

	const doc = await MatchModel.create({
		progressLevel: state.progressLevel,
		meta: {
			...state.meta,
			eventId: event._id,
		},
		players: state.players,
		mappool: state.mappool,
		banPhase: state.banPhase,
		currentPickerDiscordId: state.currentPickerDiscordId,
		currentChart: state.currentChart,
		feed: state.feed,
		status: state.status,
	});

	state._id = doc._id;
	friendlyStates.set(refUserId, state);
	return state;
}

async function saveFriendlyState(refUserId) {
	const state = friendlyStates.get(refUserId);
	if (!state?._id) return;
	await MatchModel.findByIdAndUpdate(state._id, {
		progressLevel: state.progressLevel,
		players: state.players,
		mappool: state.mappool,
		banPhase: state.banPhase,
		currentPickerDiscordId: state.currentPickerDiscordId,
		currentChart: state.currentChart,
		feed: state.feed,
		status: state.status,
		'meta.completedAt': state.meta.completedAt,
	});
}

async function recordFriendlyChartResult(refUserId, { csvName, score1, score2, fc1, fc2, pfc1, pfc2, winnerSlot }) {
	const state = friendlyStates.get(refUserId);
	if (!state) return;

	const entry = state.mappool.find(e => e.csvName === csvName);
	if (entry) {
		entry.status.played = true;
		entry.status.playedAt = new Date().toISOString();
		entry.status.inCurrentPool = false;
		entry.status.isBeingPlayed = false;
		entry.result = { score1, score2, fc1, fc2, pfc1, pfc2, winnerDiscordId: null, winnerSlot };
	}

	state.players[winnerSlot - 1].points++;
}

async function completeFriendlyMatch(refUserId, winnerSlot) {
	const state = friendlyStates.get(refUserId);
	if (!state) return;

	if (winnerSlot != null) {
		state.players[winnerSlot - 1].winner = true;
	}
	state.progressLevel = 'finished';
	state.status = 'completed';
	state.meta.completedAt = new Date().toISOString();

	const winnerName = winnerSlot != null ? (state.players[winnerSlot - 1]?.displayName ?? '?') : null;
	pushFriendlyFeed(state, 'match.end', winnerName ? `${winnerName} wins the friendly!` : 'Friendly ended.');

	await saveFriendlyState(refUserId);
	broadcastFriendlyState('friendly.end', state, { winnerName });
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
	broadcastFriendlyState,
	pushFriendlyFeed,
	buildFriendlyMappoolEntry,
};
