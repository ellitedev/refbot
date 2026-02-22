const { Schema, model } = require('mongoose');

const chartSchema = new Schema({
	name: String,
	index: Number,
	songId: { type: Number, default: null },
}, { _id: false });

const matchSchema = new Schema({ charts: [chartSchema] }, { _id: false });

const roundSchema = new Schema({
	name: String,
	matches: [matchSchema],
}, { _id: false });

const bracketSchema = new Schema({
	name: String,
	rounds: [roundSchema],
}, { _id: false });

const generatedPoolsSchema = new Schema({
	event: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
	brackets: [bracketSchema],
	generatedAt: { type: Date, default: Date.now },
});

module.exports = model('GeneratedPools', generatedPoolsSchema);
