const GeneratedPoolsModel = require('../models/GeneratedPools.js');
const { getActiveEvent } = require('./event.js');

let generatedPools = null;

function serializePools(pools) {
	return pools.map((bracket) => ({
		name: bracket.name,
		rounds: bracket.rounds.map((round) => ({
			name: round.name,
			matches: round.matches.map((match) => ({
				charts: Array.isArray(match)
					? match.map((c) => ({ name: c.name, index: c.index, songId: c.songId ?? null }))
					: match.charts.map((c) => ({ name: c.name, index: c.index, songId: c.songId ?? null })),
			})),
		})),
	}));
}

async function setGeneratedPools(pools) {
	const event = getActiveEvent();
	if (!event) throw new Error('No active event!');

	const serialized = serializePools(pools);

	await GeneratedPoolsModel.findOneAndUpdate(
		{ event: event._id },
		{ event: event._id, brackets: serialized, generatedAt: new Date() },
		{ upsert: true, new: true },
	);

	generatedPools = pools;
}

async function loadGeneratedPoolsFromDB() {
	const event = getActiveEvent();
	if (!event) return;
	const doc = await GeneratedPoolsModel.findOne({ event: event._id });
	if (!doc) return;
	generatedPools = doc.brackets;
}

function getGeneratedPools() {
	return generatedPools;
}

function getMatchPool(bracketName, roundName, matchIndex) {
	if (!generatedPools) throw new Error('Pools have not been generated yet! Ask a referee to run /generate.');

	const bracket = generatedPools.find((b) => b.name === bracketName);
	if (!bracket) throw new Error(`Bracket "${bracketName}" not found.`);

	const round = bracket.rounds.find((r) => r.name === roundName);
	if (!round) throw new Error(`Round "${roundName}" not found in bracket "${bracketName}".`);

	if (matchIndex < 0 || matchIndex >= round.matches.length) { throw new Error(`Match index ${matchIndex} out of range (${round.matches.length} matches in this round).`); }

	const match = round.matches[matchIndex];
	const charts = Array.isArray(match) ? match : match.charts;
	return charts.map((c) => ({ name: c.name, songId: c.songId ?? null }));
}

module.exports = { setGeneratedPools, loadGeneratedPoolsFromDB, getGeneratedPools, getMatchPool };
