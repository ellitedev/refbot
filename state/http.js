const http = require('node:http');
const os = require('os');
const fs = require('node:fs');
const path = require('node:path');
const { getMatchState } = require('./match.js');

let server = null;

function buildStateSnapshot() {
	const state = getMatchState();
	if (!state) return null;

	return {
		event: 'match.snapshot',
		data: {
			progressLevel: state.progressLevel,
			meta: state.meta,
			players: state.players,
			mappool: state.mappool,
			banPhase: state.banPhase,
			currentPickerDiscordId: state.currentPickerDiscordId,
			currentChart: state.currentChart,
			feed: state.feed,
		},
	};
}

function startHttpServer() {
	const port = parseInt(process.env.HTTP_PORT ?? '8081');

	server = http.createServer(async (req, res) => {
		const url = new URL(req.url, `http://${req.headers.host}`);

		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.method === 'GET' && url.pathname === '/state') {
			const snapshot = buildStateSnapshot();
			res.setHeader('Content-Type', 'application/json');
			res.writeHead(200);
			res.end(JSON.stringify(snapshot));
			return;
		}

		const strippedPath = url.pathname.replace(/^\/overlay(\/|$)/, '/') || '/';
		const overlayPath = path.join(__dirname, '../overlay', strippedPath === '/' ? 'index.html' : strippedPath);
		if (fs.existsSync(overlayPath)) {
			const ext = path.extname(overlayPath);
			const contentTypes = {
				'.html': 'text/html',
				'.js': 'text/javascript',
				'.css': 'text/css',
				'.png': 'image/png',
				'.jpg': 'image/jpeg',
				'.svg': 'image/svg+xml',
			};
			res.setHeader('Content-Type', contentTypes[ext] ?? 'application/octet-stream');
			res.writeHead(200);
			fs.createReadStream(overlayPath).pipe(res);
			return;
		}

		res.writeHead(404);
		res.end('Not found');
	});

	server.listen(port, () => {
		console.log(`\n[http] HTTP server listening on port ${port}`);
		console.log(`Local: http://localhost:${port}`);

		const interfaces = os.networkInterfaces();
		Object.keys(interfaces).forEach((interfaceName) => {
			interfaces[interfaceName].forEach((iface) => {
				if (!iface.internal && iface.family === 'IPv4') {
					console.log(`Network: http://${iface.address}:${port}`);
				}
			});
		});
		console.log('');
	});
}

function stopHttpServer() {
	server?.close();
}

module.exports = { startHttpServer, stopHttpServer };
