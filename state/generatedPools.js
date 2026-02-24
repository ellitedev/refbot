const GeneratedPoolsModel = require('../models/GeneratedPools.js');
const { getActiveEvent } = require('./event.js');

let generatedPools = null;

function serializePools(pools) {
	return pools.map((bracket) => ({
		name: bracket.name,
		rounds: bracket.rounds.map((round) => ({
			name: round.name,
			matches: round.matches.map((match) => {
				// Handle both array format and object format
				const charts = Array.isArray(match) ? match : (match.charts || []);
				return {
					charts: charts.map((c) => ({
						name: c.name,
						index: c.index,
						songId: c.songId ?? null,
					})),
				};
			}),
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
	if (!event) {
		console.log('loadGeneratedPoolsFromDB - No active event');
		return;
	}

	console.log('loadGeneratedPoolsFromDB - Loading pools for event:', event._id);

	const doc = await GeneratedPoolsModel.findOne({ event: event._id });
	if (!doc) {
		console.log('loadGeneratedPoolsFromDB - No pools document found');
		return;
	}

	// Reconstruct the pools structure to match what getMatchPool expects
	generatedPools = doc.brackets.map(bracket => {
		return {
			name: bracket.name,
			rounds: bracket.rounds.map(round => {
				return {
					name: round.name,
					matches: round.matches.map((match) => {
						// Handle Mongoose document - the actual data is in _doc
						let matchData = match;

						// If this is a Mongoose document, extract the actual data
						if (match && match._doc) {
							matchData = match._doc;
						}

						// If matchData is directly an array of charts (old format)
						if (Array.isArray(matchData)) {
							return { charts: matchData };
						}

						// If matchData has a charts property
						if (matchData && matchData.charts) {
							return { charts: matchData.charts };
						}

						// If we still don't have charts, check if the original match had charts in _doc
						if (match && match._doc && match._doc.charts) {
							return { charts: match._doc.charts };
						}

						// Default empty charts array
						console.warn('Could not extract charts from match:', match);
						return { charts: [] };
					}),
				};
			}),
		};
	});

	console.log('loadGeneratedPoolsFromDB - Reconstructed pools:',
		generatedPools.map(b => ({
			name: b.name,
			rounds: b.rounds.map(r => ({
				name: r.name,
				matchCount: r.matches.length,
				firstMatchCharts: r.matches[0]?.charts?.length || 0,
			})),
		})),
	);
}

function getGeneratedPools() {
	return generatedPools;
}

function getMatchPool(bracketName, roundName, matchIndex) {
	if (!generatedPools) throw new Error('Pools have not been generated yet! Ask a referee to run /generate.');

	// Validate matchIndex is a number
	if (typeof matchIndex !== 'number' || isNaN(matchIndex)) {
		throw new Error(`Invalid match index: ${matchIndex} must be a number`);
	}

	const bracket = generatedPools.find((b) => b.name === bracketName);
	if (!bracket) throw new Error(`Bracket "${bracketName}" not found.`);

	const round = bracket.rounds.find((r) => r.name === roundName);
	if (!round) throw new Error(`Round "${roundName}" not found in bracket "${bracketName}".`);

	if (!round.matches || !Array.isArray(round.matches)) {
		throw new Error(`No matches array found for round "${roundName}"`);
	}

	if (matchIndex < 0 || matchIndex >= round.matches.length) {
		throw new Error(`Match index ${matchIndex} out of range (0-${round.matches.length - 1} for ${round.matches.length} matches in this round).`);
	}

	const match = round.matches[matchIndex];

	// Add null check for match
	if (!match) {
		throw new Error(`Match at index ${matchIndex} is undefined.`);
	}

	// Safely access charts
	const charts = match.charts || [];

	if (!Array.isArray(charts)) {
		console.warn(`Charts is not an array for match ${matchIndex}:`, charts);
		return [];
	}

	return charts.map((c) => ({
		name: c?.name ?? 'Unknown',
		songId: c?.songId ?? null,
	}));
}

module.exports = { setGeneratedPools, loadGeneratedPoolsFromDB, getGeneratedPools, getMatchPool };