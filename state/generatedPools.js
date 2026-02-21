let generatedPools = null;

function setGeneratedPools(pools) {
	generatedPools = pools;
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

	if (matchIndex < 0 || matchIndex >= round.matches.length)
		throw new Error(`Match index ${matchIndex} out of range (${round.matches.length} matches in this round).`);

	return round.matches[matchIndex].map((c) => c.name);
}

module.exports = { setGeneratedPools, getGeneratedPools, getMatchPool };
