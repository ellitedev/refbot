const EventModel = require('../models/Event.js');

let activeEvent = null;

const FRIENDLIES_EVENT_NAME = '__friendlies__';

async function loadActiveEvent() {
	activeEvent = await EventModel.findOne({ active: true, isFriendlies: { $ne: true } });
	return activeEvent;
}

function getActiveEvent() {
	return activeEvent;
}

async function createEvent(name) {
	await EventModel.updateMany({ isFriendlies: { $ne: true } }, { active: false });
	const event = await EventModel.create({ name, active: true });
	activeEvent = event;
	return event;
}

async function switchEvent(name) {
	const event = await EventModel.findOne({ name, isFriendlies: { $ne: true } });
	if (!event) return null;
	await EventModel.updateMany({ isFriendlies: { $ne: true } }, { active: false });
	event.active = true;
	await event.save();
	activeEvent = event;
	return event;
}

async function listEvents() {
	return EventModel.find({ isFriendlies: { $ne: true } }).sort({ createdAt: -1 });
}

async function getFriendliesEvent() {
	let event = await EventModel.findOne({ isFriendlies: true });
	if (!event) {
		event = await EventModel.create({ name: FRIENDLIES_EVENT_NAME, isFriendlies: true, active: false });
		console.log('[friendlies] Created internal friendlies event.');
	}
	return event;
}

module.exports = { loadActiveEvent, getActiveEvent, createEvent, switchEvent, listEvents, getFriendliesEvent };
