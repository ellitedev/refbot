const { WebSocketServer, WebSocket } = require('ws');

let wss = null;

function startWebSocketServer() {
	const port = parseInt(process.env.WS_PORT ?? '8080');

	wss = new WebSocketServer({ port });

	wss.on('listening', () => {
		console.log(`[ws] WebSocket server listening on port ${port}`);
	});

	wss.on('connection', (socket) => {
		console.log('[ws] Client connected');
		socket.on('close', () => console.log('[ws] Client disconnected'));
		socket.on('error', (err) => console.error('[ws] Socket error:', err));
	});

	wss.on('error', (err) => {
		console.error('[ws] Server error:', err);
	});
}

function broadcast(event, data) {
	if (!wss) return;
	const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
	for (const client of wss.clients) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(payload);
		}
	}
}

module.exports = { startWebSocketServer, broadcast };
