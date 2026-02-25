const { Schema, model } = require('mongoose');

const feedEventSchema = new Schema({
	type: { type: String, required: true },
	timestamp: { type: Date, default: Date.now },
	message: { type: String, default: null },
	data: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const chartResultSchema = new Schema({
	score1: { type: Number, default: null },
	score2: { type: Number, default: null },
	fc1: { type: Boolean, default: false },
	fc2: { type: Boolean, default: false },
	pfc1: { type: Boolean, default: false },
	pfc2: { type: Boolean, default: false },
	winnerDiscordId: { type: String, default: null },
	winnerSlot: { type: Number, default: null },
}, { _id: false });

const chartStatusSchema = new Schema({
	banned: { type: Boolean, default: false },
	bannedByDiscordId: { type: String, default: null },
	bannedAt: { type: Date, default: null },
	played: { type: Boolean, default: false },
	playedAt: { type: Date, default: null },
	inCurrentPool: { type: Boolean, default: true },
	isBeingPlayed: { type: Boolean, default: false },
}, { _id: false });

const mappoolEntrySchema = new Schema({
	songId: { type: Number, default: null },
	csvName: { type: String, required: true },
	title: { type: String, default: null },
	artist: { type: String, default: null },
	charter: { type: String, default: null },
	cover: { type: String, default: null },
	thumbnailUrl: { type: String, default: null },
	difficulty: { type: Number, default: null },
	tags: { type: [String], default: [] },
	displayName: { type: String, default: null },
	status: { type: chartStatusSchema, default: () => ({}) },
	result: { type: chartResultSchema, default: null },
}, { _id: false });

const playerSchema = new Schema({
	slot: { type: Number, required: true },
	displayName: { type: String, default: null },
	discordId: { type: String, default: null },
	discordUsername: { type: String, default: null },
	discordDisplayName: { type: String, default: null },
	avatarUrl: { type: String, default: null },
	points: { type: Number, default: 0 },
	ready: { type: Boolean, default: false },
	winner: { type: Boolean, default: false },
}, { _id: false });

const banPhaseSchema = new Schema({
	banOrder: { type: [String], default: [] },
	currentBannerDiscordId: { type: String, default: null },
	bansCompleted: { type: Number, default: 0 },
	totalBans: { type: Number, default: 0 },
}, { _id: false });

const matchSchema = new Schema({
	progressLevel: {
		type: String,
		enum: ['check-in', 'ban-phase', 'playing', 'picking-post-result', 'finished'],
		default: 'check-in',
	},
	meta: {
		name: { type: String, default: null },
		round: { type: String, default: null },
		matchNumber: { type: Number, default: null },
		bestOf: { type: Number, default: null },
		winsNeeded: { type: Number, default: null },
		tier: { type: Number, default: null },
		channelId: { type: String, required: true },
		eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
		startedAt: { type: Date, default: Date.now },
		completedAt: { type: Date, default: null },
	},
	players: { type: [playerSchema], default: [] },
	mappool: { type: [mappoolEntrySchema], default: [] },
	banPhase: { type: banPhaseSchema, default: () => ({}) },
	currentPickerDiscordId: { type: String, default: null },
	currentChart: { type: String, default: null },
	feed: { type: [feedEventSchema], default: [] },
	status: {
		type: String,
		enum: ['in_progress', 'completed', 'restarted'],
		default: 'in_progress',
	},
});

module.exports = model('Match', matchSchema);
