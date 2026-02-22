const { Schema, model } = require('mongoose');

const chartSchema = new Schema({
	songId: { type: Number, required: true, unique: true },
	title: String,
	artist: String,
	charter: String,
	cover: String,
	thumbnailUrl: String,
	difficulty: Number,
	tags: [String],
	csvName: String,
	fetchedAt: { type: Date, default: Date.now },
});

chartSchema.virtual('displayName').get(function() {
	return `${this.title} - ${this.charter}`;
});

module.exports = model('Chart', chartSchema);
