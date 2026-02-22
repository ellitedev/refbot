const MapPoolModel = require('../models/MapPool.js');
const { getActiveEvent } = require('./event.js');
const { extractSongId, fetchAndCacheChart } = require('./spinshare.js');

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
		const spinshareUrl = cols[4];
		const tier = parseInt(cols[7]);

		if (!songName || isNaN(tier)) continue;
		if (!pools[tier]) continue;

		const songId = extractSongId(spinshareUrl);
		const csvName = `${songName} - ${charter}`;

		pools[tier].push({ songId, csvName });
	}

	return pools;
}

async function fetchMapPool(sheetUrl) {
	const event = getActiveEvent();
	if (!event) throw new Error('No active event! Use /event to create or switch to one.');

	const csvUrl = toCsvUrl(sheetUrl);
	const res = await fetch(csvUrl);
	if (!res.ok) throw new Error(`Failed to fetch map pool: ${res.status} ${res.statusText}`);
	const text = await res.text();
	const pools = parseCSV(text);

	const poolsForDB = {};
	for (const [tier, charts] of Object.entries(pools)) {
		poolsForDB[tier] = charts.map((c) => ({ songId: c.songId, csvName: c.csvName }));
	}

	await MapPoolModel.findOneAndUpdate(
		{ event: event._id },
		{ event: event._id, pools: poolsForDB, lastFetched: new Date() },
		{ upsert: true, new: true },
	);

	cache = pools;
	lastFetched = new Date();

	fetchAllChartData(pools).catch((err) => console.error('[spinshare] Background fetch error:', err));

	return pools;
}

async function fetchAllChartData(pools) {
	const allCharts = Object.values(pools).flat();
	console.log(`[spinshare] Fetching data for ${allCharts.length} charts...`);
	let success = 0;
	for (const { songId, csvName } of allCharts) {
		if (!songId) continue;
		const doc = await fetchAndCacheChart(songId, csvName);
		if (doc) success++;
		await new Promise((r) => setTimeout(r, 150));
	}
	console.log(`[spinshare] Fetched ${success}/${allCharts.length} charts successfully.`);
}

async function loadMapPoolFromDB() {
	const event = getActiveEvent();
	if (!event) return;
	const doc = await MapPoolModel.findOne({ event: event._id });
	if (!doc) return;

	const rawPools = Object.fromEntries(doc.pools);
	cache = {};
	for (const [tier, charts] of Object.entries(rawPools)) {
		cache[tier] = charts.map((c) =>
			typeof c === 'string'
				? { songId: null, csvName: c }
				: { songId: c.songId ?? null, csvName: c.csvName },
		);
	}
	lastFetched = doc.lastFetched;
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

module.exports = { fetchMapPool, loadMapPoolFromDB, getPool, getCacheInfo };
