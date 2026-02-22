const { Schema, model } = require('mongoose');

const chartResultSchema = new Schema({
	chart: String,
	score1: Number,
	score2: Number,
	fc1: Boolean,
	fc2: Boolean,
	pfc1: Boolean,
	pfc2: Boolean,
	winner: String,
}, { _id: false });

const matchSchema = new Schema({
	event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
	round: { type: String, required: true },
	matchNumber: { type: Number, required: true },
	player1: { type: String, required: true },
	player2: { type: String, required: true },
	player1DiscordId: String,
	player2DiscordId: String,
	score: { type: [Number], default: [0, 0] },
	bestOf: Number,
	tier: Number,
	winner: String,
	fullMapPool: [String],
	currentMapPool: [String],
	playedCharts: [String],
	currentChart: { type: String, default: null },
	currentPickerDiscordId: { type: String, default: null },
	chartResults: [chartResultSchema],
	status: { type: String, enum: ['in_progress', 'completed', 'restarted'], default: 'in_progress' },
	channelId: { type: String, required: true },
	startedAt: { type: Date, default: Date.now },
	completedAt: { type: Date, default: null },
});

module.exports = model('Match', matchSchema);
