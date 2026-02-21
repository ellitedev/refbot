function shuffle(array, random) {
	const arr = [...array];
	for (let i = arr.length - 1; i > 2; i--) {
		const index = Math.floor(random() * (i - 1));
		[arr[i], arr[index]] = [arr[index], arr[i]];
	}
	return arr;
}

function makePool(charts) {
	let remaining = [...charts];

	function getRandom(count, random) {
		const match = [];
		while (match.length < count) {
			const index = Math.floor(random() * remaining.length);
			const chart = remaining[index];
			if (match.includes(chart)) continue;
			remaining.splice(index, 1);
			if (remaining.length === 0) remaining = [...charts];
			match.push(chart);
		}
		return [...match].sort((a, b) => a.index - b.index);
	}

	function getHardest(count) {
		return charts.slice(charts.length - count).sort((a, b) => a.index - b.index);
	}

	return { getRandom, getHardest };
}

function generatePools(tierPools, bracketsConfig) {
	const random = Math.random.bind(Math);
	const result = [];

	for (const bracket of bracketsConfig) {
		const bracketResult = { name: bracket.name, rounds: [] };

		for (const roundConfig of bracket.rounds) {
			const tier = roundConfig.pool + 1;
			const charts = tierPools[tier];
			if (!charts || charts.length === 0) continue;

			const pool = makePool(charts);
			const matches = [];

			for (let k = 0; k < roundConfig.matches; k++) {
				const match = roundConfig.hardestOnly
					? pool.getHardest(roundConfig.charts)
					: pool.getRandom(roundConfig.charts, random);
				matches.push(match);
			}

			const shuffled = shuffle(matches, random);
			bracketResult.rounds.push({ name: roundConfig.name, matches: shuffled });
		}

		result.push(bracketResult);
	}

	return result;
}

module.exports = { generatePools };
