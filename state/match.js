const MatchModel = require('../models/Match.js');
const { getActiveEvent } = require('./event.js');
const { getChartData } = require('../util/broadcastMatch.js');

let matchState = null;

function getMatchState() {
	return matchState;
}

function resetMatchState() {
	matchState = null;
}

function pushFeedEvent(type, message, data = {}) {
	if (!matchState) return;
	matchState.feed.push({
		type,
		timestamp: new Date().toISOString(),
		message: message ?? null,
		data,
	});
}

async function buildMappoolEntry(entry) {
	const csvName = typeof entry === 'string' ? entry : (entry.csvName ?? entry.name);
	const songId = typeof entry === 'string' ? null : (entry.songId ?? null);
	const chartData = await getChartData(csvName, songId);

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
		displayName: chartData?.displayName ?? csvName,
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

function buildPlayerEntry(slot, user, displayName) {
	return {
		slot,
		displayName: displayName ?? null,
		discordId: user?.id ?? null,
		discordUsername: user?.username ?? null,
		discordDisplayName: user?.displayName ?? user?.username ?? null,
		avatarUrl: user?.displayAvatarURL({ size: 128, extension: 'png' }) ?? null,
		points: 0,
		ready: false,
		winner: false,
	};
}

async function initMatchState({ player1, player2, player1Name, player2Name, firstBanner, bestOf, tier, mapPool, interaction, round, matchNumber }) {
	const event = getActiveEvent();
	if (!event) throw new Error('No active event!');

	const channelId = interaction.channel?.id ?? interaction.channelId;
	const winsNeeded = Math.ceil(bestOf / 2);
	const numBans = mapPool.length - 1;
	const banOrder = Array.from({ length: numBans }, (_, i) => {
		const secondBanner = firstBanner.id === player1.id ? player2 : player1;
		return (i % 2 === 0 ? firstBanner : secondBanner).id;
	});

	const builtMappool = await Promise.all(mapPool.map(entry => buildMappoolEntry(entry)));

	const state = {
		progressLevel: 'ban-phase',
		meta: {
			name: `${round} - Match ${matchNumber}`,
			round,
			matchNumber,
			bestOf,
			winsNeeded,
			tier: tier ?? null,
			channelId,
			eventId: event._id,
			startedAt: new Date().toISOString(),
			completedAt: null,
		},
		players: [
			buildPlayerEntry(1, player1, player1Name),
			buildPlayerEntry(2, player2, player2Name),
		],
		mappool: builtMappool,
		banPhase: {
			banOrder,
			currentBannerDiscordId: firstBanner.id,
			bansCompleted: 0,
			totalBans: numBans,
		},
		currentPickerDiscordId: null,
		currentChart: null,
		feed: [],
		status: 'in_progress',
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
	matchState = state;

	pushFeedEvent('match.start', `Match started: ${state.meta.name}`);
	await saveMatchState();

	return matchState;
}

async function saveMatchState() {
	if (!matchState?._id) return;
	await MatchModel.findByIdAndUpdate(matchState._id, {
		progressLevel: matchState.progressLevel,
		players: matchState.players,
		mappool: matchState.mappool,
		banPhase: matchState.banPhase,
		currentPickerDiscordId: matchState.currentPickerDiscordId,
		currentChart: matchState.currentChart,
		feed: matchState.feed,
		status: matchState.status,
		'meta.completedAt': matchState.meta.completedAt,
	});
}

async function banChart(csvName, bannerDiscordId) {
	if (!matchState) return;

	const entry = matchState.mappool.find(c => c.csvName === csvName);
	if (!entry) return;

	entry.status.banned = true;
	entry.status.bannedByDiscordId = bannerDiscordId;
	entry.status.bannedAt = new Date().toISOString();
	entry.status.inCurrentPool = false;

	matchState.banPhase.bansCompleted++;
	const nextBannerDiscordId = matchState.banPhase.banOrder[matchState.banPhase.bansCompleted] ?? null;
	matchState.banPhase.currentBannerDiscordId = nextBannerDiscordId;

	const bannerPlayer = matchState.players.find(p => p.discordId === bannerDiscordId);
	pushFeedEvent('ban', `${bannerPlayer?.displayName ?? bannerDiscordId} banned ${entry.displayName ?? csvName}`, { csvName, bannerDiscordId });

	await saveMatchState();
}

async function startPickPhase(firstPickerDiscordId) {
	if (!matchState) return;

	matchState.progressLevel = 'picking-post-result';
	matchState.currentPickerDiscordId = firstPickerDiscordId;

	pushFeedEvent('pick-phase-start', 'Ban phase complete, pick phase starting', { firstPickerDiscordId });
	await saveMatchState();
}

async function pickChart(csvName, pickerDiscordId) {
	if (!matchState) return;

	const entry = matchState.mappool.find(c => c.csvName === csvName);
	if (!entry) return;

	matchState.currentChart = csvName;
	matchState.progressLevel = 'playing';

	matchState.mappool.forEach(c => { c.status.isBeingPlayed = false; });
	entry.status.isBeingPlayed = true;

	matchState.players.forEach(p => { p.ready = false; });

	const pickerPlayer = matchState.players.find(p => p.discordId === pickerDiscordId);
	pushFeedEvent('pick', `${pickerPlayer?.displayName ?? pickerDiscordId} picked ${entry.displayName ?? csvName}`, { csvName, pickerDiscordId });

	await saveMatchState();
}

async function submitResult({ csvName, score1, score2, fc1, fc2, pfc1, pfc2 }) {
	if (!matchState) return;

	const entry = matchState.mappool.find(c => c.csvName === csvName);
	if (!entry) return;

	const p1 = matchState.players[0];
	const p2 = matchState.players[1];

	let winnerDiscordId = null;
	let winnerSlot = null;

	if (score1 > score2) {
		winnerDiscordId = p1.discordId;
		winnerSlot = 1;
		p1.points++;
	}
	else if (score2 > score1) {
		winnerDiscordId = p2.discordId;
		winnerSlot = 2;
		p2.points++;
	}

	entry.status.isBeingPlayed = false;
	entry.status.played = true;
	entry.status.playedAt = new Date().toISOString();
	entry.status.inCurrentPool = false;
	entry.result = { score1, score2, fc1, fc2, pfc1, pfc2, winnerDiscordId, winnerSlot };

	matchState.currentChart = null;

	const winsNeeded = matchState.meta.winsNeeded;
	const winner = matchState.players.find(p => p.points >= winsNeeded);

	if (winner) {
		winner.winner = true;
		matchState.progressLevel = 'finished';
		matchState.status = 'completed';
		matchState.meta.completedAt = new Date().toISOString();
		pushFeedEvent('match.end', `${winner.displayName} wins the match!`, { winnerDiscordId: winner.discordId });
	}
	else {
		matchState.progressLevel = 'picking-post-result';
		const nextPickerDiscordId = winnerDiscordId ?? matchState.currentPickerDiscordId;
		matchState.currentPickerDiscordId = nextPickerDiscordId;
		pushFeedEvent('result', `${entry.displayName ?? csvName} result submitted. Score: ${score1} - ${score2}`, { csvName, score1, score2, winnerDiscordId, winnerSlot });
	}

	await saveMatchState();

	return { winner: winner ?? null };
}

async function setPlayerReady(discordId) {
	if (!matchState) return false;

	const player = matchState.players.find(p => p.discordId === discordId);
	if (!player) return false;

	player.ready = true;
	pushFeedEvent('ready', `${player.displayName} is ready`, { discordId });
	await saveMatchState();

	return matchState.players.every(p => p.ready);
}

async function completeMatch(winnerDiscordId) {
	if (!matchState) return;

	const winner = matchState.players.find(p => p.discordId === winnerDiscordId);
	if (winner) winner.winner = true;

	matchState.progressLevel = 'finished';
	matchState.status = 'completed';
	matchState.meta.completedAt = new Date().toISOString();

	pushFeedEvent('match.end', `${winner?.displayName ?? winnerDiscordId} wins the match!`, { winnerDiscordId });
	await saveMatchState();

	matchState = null;
}

async function loadInProgressMatch() {
	const event = getActiveEvent();
	if (!event) return null;
	return MatchModel.findOne({ 'meta.eventId': event._id, status: 'in_progress' });
}

async function restoreMatchState(doc) {
	matchState = {
		_id: doc._id,
		progressLevel: doc.progressLevel,
		meta: doc.meta,
		players: doc.players,
		mappool: doc.mappool,
		banPhase: doc.banPhase,
		currentPickerDiscordId: doc.currentPickerDiscordId,
		currentChart: doc.currentChart,
		feed: doc.feed,
		status: doc.status,
	};
	return matchState;
}

module.exports = {
	getMatchState,
	resetMatchState,
	pushFeedEvent,
	initMatchState,
	saveMatchState,
	banChart,
	startPickPhase,
	pickChart,
	submitResult,
	setPlayerReady,
	completeMatch,
	loadInProgressMatch,
	restoreMatchState,
};
