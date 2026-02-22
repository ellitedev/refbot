const ChartModel = require('../models/Chart.js');

const SPINSHARE_API = 'https://spinsha.re/api/song';

function extractSongId(url) {
	const match = url?.match(/spinsha\.re\/song\/(\d+)/);
	return match ? parseInt(match[1]) : null;
}

function getHighestDifficulty(data) {
	const diffs = [
		data.XDDifficulty,
		data.expertDifficulty,
		data.hardDifficulty,
		data.normalDifficulty,
		data.easyDifficulty,
	].filter(Boolean);
	return diffs[0] ?? 0;
}

async function fetchChartFromAPI(songId) {
	const res = await fetch(`${SPINSHARE_API}/${songId}`);
	if (!res.ok) throw new Error(`SpinShare API returned ${res.status} for song ${songId}`);
	const json = await res.json();
	if (json.status !== 200) throw new Error(`SpinShare API error for song ${songId}: ${json.status}`);
	return json.data;
}

async function fetchAndCacheChart(songId, csvName) {
	try {
		const data = await fetchChartFromAPI(songId);

		const doc = await ChartModel.findOneAndUpdate(
			{ songId },
			{
				songId,
				title: data.title,
				artist: data.artist,
				charter: data.charter,
				cover: data.cover,
				thumbnailUrl: data.paths?.cover ?? null,
				difficulty: getHighestDifficulty(data),
				tags: data.tags ?? [],
				csvName: csvName ?? null,
				fetchedAt: new Date(),
			},
			{ upsert: true, new: true },
		);

		return doc;
	}
	catch (err) {
		console.warn(`[spinshare] Failed to fetch song ${songId}: ${err.message}`);
		return null;
	}
}

async function getChart(songId, csvName) {
	const cached = await ChartModel.findOne({ songId });
	if (cached) return cached;
	return fetchAndCacheChart(songId, csvName);
}

async function getChartByName(displayName) {
	return ChartModel.findOne({
		$or: [
			{ csvName: displayName },
		],
	});
}

module.exports = { extractSongId, fetchAndCacheChart, getChart, getChartByName };
