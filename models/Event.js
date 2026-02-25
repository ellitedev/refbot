const { Schema, model } = require('mongoose');

const eventSchema = new Schema({
	name: { type: String, required: true, unique: true },
	createdAt: { type: Date, default: Date.now },
	active: { type: Boolean, default: false },
});

module.exports = model('Event', eventSchema);
