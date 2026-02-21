const players = ['Player 1', 'Player 2'];

let matchState = null;

function getMatchState() {
	return matchState;
}

function resetMatchState() {
	matchState = null;
}

function initMatchState(p1, p2, firstPicker, bestOf, tier, mapPool, interaction) {
	matchState = {
		player1: p1,
		player2: p2,
		playerNames: [players[0], players[1]],
		fullMapPool: [...mapPool],
		playedCharts: [],
		currentMapPool: [...mapPool],
		score: [0, 0],
		bestOf,
		tier,
		winsNeeded: Math.ceil(bestOf / 2),
		currentPicker: firstPicker,
		currentChart: null,
		interaction,
	};
	return matchState;
}

module.exports = { players, getMatchState, resetMatchState, initMatchState };
