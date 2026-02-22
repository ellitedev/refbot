/* eslint-disable no-multi-spaces */
const ROUNDS = [
	{ name: 'Qualifiers – Winners 1',             bestOf: 3, tier: 1, bracket: 'Qualifiers', round: 'Winners 1' },
	{ name: 'Qualifiers – Winners 2',             bestOf: 3, tier: 2, bracket: 'Qualifiers', round: 'Winners 2' },
	{ name: 'Qualifiers – Losers 1',              bestOf: 3, tier: 1, bracket: 'Qualifiers', round: 'Losers 1' },
	{ name: 'Qualifiers – Losers 2',              bestOf: 3, tier: 2, bracket: 'Qualifiers', round: 'Losers 2' },
	{ name: 'Qualifiers – Finals',                bestOf: 3, tier: 2, bracket: 'Qualifiers', round: 'Finals' },
	{ name: 'Qualifiers – Finals (Reset)',         bestOf: 3, tier: 2, bracket: 'Qualifiers', round: 'Finals (Reset)' },
	{ name: 'Challenger – Winners 1',             bestOf: 5, tier: 2, bracket: 'Challenger', round: 'Winners 1' },
	{ name: 'Challenger – Winners 2',             bestOf: 7, tier: 3, bracket: 'Challenger', round: 'Winners 2' },
	{ name: 'Challenger – Winners Finals',        bestOf: 9, tier: 3, bracket: 'Challenger', round: 'Winners Finals' },
	{ name: 'Challenger – Losers 1',              bestOf: 5, tier: 2, bracket: 'Challenger', round: 'Losers 1' },
	{ name: 'Challenger – Losers 2',              bestOf: 5, tier: 3, bracket: 'Challenger', round: 'Losers 2' },
	{ name: 'Challenger – Losers 3',              bestOf: 7, tier: 3, bracket: 'Challenger', round: 'Losers 3' },
	{ name: 'Challenger – Losers Finals',         bestOf: 7, tier: 3, bracket: 'Challenger', round: 'Losers Finals' },
	{ name: 'Challenger – Grand Finals',          bestOf: 9, tier: 3, bracket: 'Challenger', round: 'Grand Finals' },
	{ name: 'Challenger – Grand Finals (Reset)',  bestOf: 9, tier: 3, bracket: 'Challenger', round: 'Grand Finals (Reset)' },
	{ name: 'Elite – Winners 1',                  bestOf: 5, tier: 3, bracket: 'Elite',      round: 'Winners 1' },
	{ name: 'Elite – Winners 2',                  bestOf: 7, tier: 4, bracket: 'Elite',      round: 'Winners 2' },
	{ name: 'Elite – Winners Finals',             bestOf: 9, tier: 4, bracket: 'Elite',      round: 'Winners Finals' },
	{ name: 'Elite – Losers 1',                   bestOf: 5, tier: 3, bracket: 'Elite',      round: 'Losers 1' },
	{ name: 'Elite – Losers 2',                   bestOf: 5, tier: 4, bracket: 'Elite',      round: 'Losers 2' },
	{ name: 'Elite – Losers 3',                   bestOf: 7, tier: 4, bracket: 'Elite',      round: 'Losers 3' },
	{ name: 'Elite – Losers Finals',              bestOf: 7, tier: 4, bracket: 'Elite',      round: 'Losers Finals' },
	{ name: 'Elite – Grand Finals',               bestOf: 9, tier: 4, bracket: 'Elite',      round: 'Grand Finals' },
	{ name: 'Elite – Grand Finals (Reset)',       bestOf: 9, tier: 4, bracket: 'Elite',      round: 'Grand Finals (Reset)' },
];

function getRound(name) {
	return ROUNDS.find((r) => r.name === name) ?? null;
}

module.exports = { ROUNDS, getRound };
