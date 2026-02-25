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
	const overlayDir = path.join(__dirname, '..', 'overlay');

	server = http.createServer(async (req, res) => {
		// Handle /state endpoint
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

		// Handle file requests from /overlay
		if (req.method === 'GET') {
			// Normalize the URL to prevent directory traversal attacks
			let filePath;
			if (req.url === '/') {
				filePath = path.join(overlayDir, 'index.html');
			}
			else {
				// Remove leading slash and join with overlay directory
				const relativePath = req.url.slice(1);
				filePath = path.join(overlayDir, relativePath);
			}

			// Security check: ensure the resolved path is still within overlay directory
			const resolvedPath = path.resolve(filePath);
			if (!resolvedPath.startsWith(path.resolve(overlayDir))) {
				res.writeHead(403);
				res.end('Access denied');
				return;
			}

			// Read and serve the file
			fs.readFile(resolvedPath, (err, data) => {
				if (err) {
					if (err.code === 'ENOENT') {
						res.writeHead(404);
						res.end('File not found');
					}
					else {
						res.writeHead(500);
						res.end('Could not read file');
						console.error('[http] Failed to read file:', err);
					}
					return;
				}

				// Determine content type based on file extension
				const ext = path.extname(resolvedPath).toLowerCase();
				const contentType = {
					'.html': 'text/html; charset=utf-8',
					'.htm': 'text/html; charset=utf-8',
					'.css': 'text/css',
					'.js': 'application/javascript',
					'.json': 'application/json',
					'.png': 'image/png',
					'.jpg': 'image/jpeg',
					'.jpeg': 'image/jpeg',
					'.gif': 'image/gif',
					'.svg': 'image/svg+xml',
					'.ico': 'image/x-icon',
					'.txt': 'text/plain',
					'.woff': 'font/woff',
					'.woff2': 'font/woff2',
					'.ttf': 'font/ttf',
					'.eot': 'application/vnd.ms-fontobject',
				}[ext] || 'application/octet-stream';

				// Special handling for HTML files to inject ports
				if (ext === '.html' && req.url === '/') {
					// Only inject into the main index.html
					const htmlContent = data.toString('utf8');
					const wsPort = process.env.WS_PORT ?? '8080';
					const httpPort = process.env.HTTP_PORT ?? '8081';
					const injected = htmlContent.replace('</head>', `<script>window.WS_PORT = ${wsPort}; window.HTTP_PORT = ${httpPort};</script>\n</head>`);

					res.writeHead(200, { 'Content-Type': contentType });
					res.end(injected);
				}
				else {
					res.writeHead(200, { 'Content-Type': contentType });
					res.end(data);
				}
			});
			return;
		}

		// Handle unsupported methods
		res.writeHead(405);
		res.end('Method not allowed');
	});

	server.listen(port, () => {
		console.log(`[http] Overlay server listening on http://localhost:${port}`);
		console.log(`[http] Serving files from: ${overlayDir}`);
	});

	server.on('error', (err) => {
		console.error('[http] Server error:', err);
	});
}

module.exports = { startHttpServer };
