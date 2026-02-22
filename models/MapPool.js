const { Schema, model } = require('mongoose');

const chartEntrySchema = new Schema({
	songId: { type: Number, default: null },
	csvName: { type: String, required: true },
}, { _id: false });

const mapPoolSchema = new Schema({
	event: { type: Schema.Types.ObjectId, ref: 'Event', required: true, unique: true },
	pools: {
		type: Map,
		of: [chartEntrySchema],
	},
	lastFetched: { type: Date, default: Date.now },
});

module.exports = model('MapPool', mapPoolSchema);
