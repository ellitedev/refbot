const EventModel = require('../models/Event.js');

let activeEvent = null;

async function loadActiveEvent() {
	activeEvent = await EventModel.findOne({ active: true });
	return activeEvent;
}

function getActiveEvent() {
	return activeEvent;
}

async function createEvent(name) {
	await EventModel.updateMany({}, { active: false });
	const event = await EventModel.create({ name, active: true });
	activeEvent = event;
	return event;
}

async function switchEvent(name) {
	const event = await EventModel.findOne({ name });
	if (!event) return null;
	await EventModel.updateMany({}, { active: false });
	event.active = true;
	await event.save();
	activeEvent = event;
	return event;
}

async function listEvents() {
	return EventModel.find().sort({ createdAt: -1 });
}

module.exports = { loadActiveEvent, getActiveEvent, createEvent, switchEvent, listEvents };
