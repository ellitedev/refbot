let cache = null;
let lastFetched = null;

function toCsvUrl(url) {
	const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
	if (!match) throw new Error('Invalid Google Sheets URL.');
	return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
}

function parseCSVLine(line) {
	const cols = [];
	let cur = '';
	let inQuotes = false;
	for (const ch of line) {
		if (ch === '"') {
			inQuotes = !inQuotes;
		}
		else if (ch === ',' && !inQuotes) {
			cols.push(cur.trim());
			cur = '';
		}
		else {
			cur += ch;
		}
	}
	cols.push(cur.trim());
	return cols;
}

function parseCSV(text) {
	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	const pools = { 1: [], 2: [], 3: [], 4: [] };

	for (let i = 1; i < lines.length; i++) {
		const cols = parseCSVLine(lines[i]);
		const songName = cols[1];
		const charter = cols[3];
		const tier = parseInt(cols[7]);

		if (!songName || isNaN(tier)) continue;
		if (!pools[tier]) continue;

		pools[tier].push(`${songName} - ${charter}`);
	}

	return pools;
}

async function fetchMapPool(sheetUrl) {
	const csvUrl = toCsvUrl(sheetUrl);
	const res = await fetch(csvUrl);
	if (!res.ok) throw new Error(`Failed to fetch map pool: ${res.status} ${res.statusText}`);
	const text = await res.text();
	cache = parseCSV(text);
	lastFetched = new Date();
	return cache;
}

function getPool(tier) {
	if (!cache) throw new Error('Map pool has not been loaded yet! Ask a referee to run /refresh.');
	const pool = cache[tier];
	if (!pool || pool.length === 0) throw new Error(`No maps found for tier ${tier}.`);
	return [...pool];
}

function getCacheInfo() {
	return { loaded: cache !== null, lastFetched };
}

module.exports = { fetchMapPool, getPool, getCacheInfo };
