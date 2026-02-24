const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getMatchState } = require('./match.js');
const { getChartData } = require('../util/broadcastMatch.js');

let server = null;

async function buildStateSnapshot() {
	const state = getMatchState();
	if (!state) return null;

	const chart = state.currentChart;
	const chartName = typeof chart === 'string' ? chart : (chart?.name ?? null);
	const chartSongId = typeof chart === 'string' ? null : (chart?.songId ?? null);
	const currentChartData = chartName || chartSongId
		? await getChartData(chartName, chartSongId)
		: null;

	const poolWithData = await Promise.all(
		(state.currentMapPool ?? []).map(async (entry) => {
			const name = typeof entry === 'string' ? entry : entry.name;
			const songId = typeof entry === 'string' ? null : (entry.songId ?? null);
			const data = await getChartData(name, songId);
			return data ?? { displayName: name };
		}),
	);

	const fullPoolWithData = await Promise.all(
		(state.fullMapPool ?? []).map(async (entry) => {
			const name = typeof entry === 'string' ? entry : entry.name;
			const songId = typeof entry === 'string' ? null : (entry.songId ?? null);
			const data = await getChartData(name, songId);
			return data ?? { displayName: name };
		}),
	);

	return {
		event: 'match.snapshot',
		data: {
			round: state.round,
			matchNumber: state.matchNumber,
			players: [
				{
					name: state.playerNames[0],
					discordId: state.player1?.id ?? null,
					username: state.player1?.username ?? null,
					displayName: state.player1?.displayName ?? state.player1?.username ?? null,
					avatar: state.player1?.displayAvatarURL({ size: 128, extension: 'png' }) ?? null,
				},
				{
					name: state.playerNames[1],
					discordId: state.player2?.id ?? null,
					username: state.player2?.username ?? null,
					displayName: state.player2?.displayName ?? state.player2?.username ?? null,
					avatar: state.player2?.displayAvatarURL({ size: 128, extension: 'png' }) ?? null,
				},
			],
			score: state.score,
			bestOf: state.bestOf,
			winsNeeded: state.winsNeeded,
			currentChart: currentChartData,
			currentMapPool: poolWithData,
			fullMapPool: fullPoolWithData,
			playedCharts: state.playedCharts,
			bannedCharts: state.bannedCharts ?? [],
			currentPickerDiscordId: state.currentPicker?.id ?? null,
			currentBannerDiscordId: state.currentBanner?.id ?? null,
		},
	};
}

function startHttpServer() {
	const port = parseInt(process.env.HTTP_PORT ?? '8081');
	const overlayPath = path.join(__dirname, '..', 'overlay', 'index.html');

	server = http.createServer(async (req, res) => {
		if (req.method === 'GET' && req.url === '/state') {
			try {
				const snapshot = await buildStateSnapshot();
				res.writeHead(200, {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				});
				res.end(JSON.stringify(snapshot));
			}
			catch (err) {
				console.error('[http] Failed to build state snapshot:', err);
				res.writeHead(500);
				res.end('null');
			}
			return;
		}

		if (req.method !== 'GET' || req.url !== '/') {
			res.writeHead(404);
			res.end('Not found');
			return;
		}

		fs.readFile(overlayPath, 'utf8', (err, data) => {
			if (err) {
				res.writeHead(500);
				res.end('Could not read overlay file');
				console.error('[http] Failed to read overlay:', err);
				return;
			}

			const wsPort = process.env.WS_PORT ?? '8080';
			const httpPort = process.env.HTTP_PORT ?? '8081';
			const injected = data.replace('</head>', `<script>window.WS_PORT = ${wsPort}; window.HTTP_PORT = ${httpPort};</script>\n</head>`);

			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(injected);
		});
	});

	server.listen(port, () => {
		console.log(`[http] Overlay server listening on http://localhost:${port}`);
	});

	server.on('error', (err) => {
		console.error('[http] Server error:', err);
	});
}

module.exports = { startHttpServer };
