// PATCH: overlay/script.js
//
// 1. In handleMessage(), add this to the top of the function, right after
//    the cacheChartData calls:
//
//    if (data.isFriendly) setFriendlyMode(true);
//
// 2. Add this helper function somewhere near the top (alongside setStatus etc.):

function setFriendlyMode(on) {
	const label = document.getElementById('round-label');
	if (!label) return;
	if (on) {
		label.dataset.friendly = '1';
	} else {
		delete label.dataset.friendly;
	}
}

// 3. Add these cases inside the switch(event) block in handleMessage().
//    They slot right alongside the existing match.* cases:

// ──────────────────────────────────────────────
// FRIENDLY EVENTS - these mirror match.* events
// but are emitted by friendly matches.
// The overlay reuses the same match-view layout.
// ──────────────────────────────────────────────

// case 'friendly.snapshot': {
//   Full state restore on reconnect (same shape as match.snapshot)
// }
	case 'friendly.snapshot':
	case 'match.snapshot':
		if (data.isFriendly) setFriendlyMode(true);
		if (data.mappool?.length) {
			fullMapPool = [...data.mappool];
			cacheChartData(fullMapPool);
		}
		// compat: if old fields exist, use them; new schema uses mappool
		if (data.fullMapPool?.length) {
			fullMapPool = [...data.fullMapPool];
			cacheChartData(fullMapPool);
		}
		if (data.bannedCharts) bannedChartNames = new Set(data.bannedCharts.map(b => typeof b === 'string' ? b : b.name));
		playedChartNames = new Set(
			(data.mappool ?? [])
				.filter(e => e.status?.played)
				.map(e => entryName(e))
		);
		activePoolNames = new Set(
			(data.mappool ?? [])
				.filter(e => e.status?.inCurrentPool && !e.status?.banned && !e.status?.played)
				.map(e => entryName(e))
		);
		currentChartName = data.currentChart ? entryName(data.currentChart) : null;
		chartIsLive = !!data.currentChart;
		updateScoreboard(data);
		if (data.currentChart) updateCurrentChart(data.currentChart);
		renderMapPool();
		showMatchView();
		break;

	case 'friendly.start':
		setFriendlyMode(true);
		document.getElementById('end-banner').style.display = 'none';
		fullMapPool = [...(data.mappool ?? [])];
		cacheChartData(fullMapPool);
		activePoolNames = new Set(fullMapPool.map(entryName));
		playedChartNames = new Set();
		bannedChartNames = new Set();
		currentChartName = null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed(`Friendly started: ${data.players?.[0]?.displayName ?? 'P1'} vs ${data.players?.[1]?.displayName ?? 'P2'}`, 'feed-pick');
		updatePhaseBar('picking', 'Friendly match starting...');
		showMatchView();
		break;

	case 'friendly.ban': {
		const bannedEntry = data.mappool?.find(e => e.status?.banned && entryName(e) === data.bannedChart) ?? data.bannedChart;
		if (data.bannedChart) bannedChartNames.add(data.bannedChart);
		activePoolNames = new Set(
			(data.mappool ?? [])
				.filter(e => e.status?.inCurrentPool && !e.status?.banned && !e.status?.played)
				.map(e => entryName(e))
		);
		const bannerName = data.bannedByName ?? 'Someone';
		addFeed(`${bannerName} banned ${data.bannedChart}`, 'feed-ban');
		updateScoreboard(data);
		renderMapPool();
		break;
	}

	case 'friendly.pickPhaseStart': {
		const pickerName = data.currentPickerDiscordId ?? data.players?.[0]?.displayName ?? '?';
		updatePhaseBar('picking', `${pickerName} is picking...`);
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed(`${pickerName} is picking`, 'feed-pick');
		break;
	}

	case 'friendly.pick': {
		activePoolNames = new Set(
			(data.mappool ?? [])
				.filter(e => e.status?.inCurrentPool && !e.status?.banned && !e.status?.played)
				.map(e => entryName(e))
		);
		currentChartName = data.currentChart ? entryName(data.currentChart) : null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		const pickedEntry = data.mappool?.find(e => entryName(e) === data.currentChart);
		if (pickedEntry ?? data.currentChart) updateCurrentChart(pickedEntry ?? data.currentChart);
		renderMapPool();
		const fpn = data.pickedByName ?? data.currentPickerDiscordId ?? '?';
		const fcn = data.currentChart ? entryDisplay(pickedEntry ?? data.currentChart) : '?';
		addFeed(`${fpn} picked ${fcn}`, 'feed-pick');
		updatePhaseBar('playing', `Playing: ${fcn}`);
		break;
	}

	case 'friendly.playerReady':
		p1Ready = data.p1Ready ?? false;
		p2Ready = data.p2Ready ?? false;
		updateReadyState();
		break;

	case 'friendly.chartStart':
		p1Ready = true;
		p2Ready = true;
		updateReadyState();
		currentChartName = data.currentChart ? entryName(data.currentChart) : currentChartName;
		chartIsLive = true;
		updateScoreboard(data);
		{
			const playingEntry = data.mappool?.find(e => entryName(e) === data.currentChart);
			if (playingEntry ?? data.currentChart) updateCurrentChart(playingEntry ?? data.currentChart);
		}
		renderMapPool();
		addFeed(`Now playing: ${data.currentChart ? entryDisplay(data.mappool?.find(e => entryName(e) === data.currentChart) ?? data.currentChart) : '?'}`, 'feed-pick');
		break;

	case 'friendly.chartResult': {
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		if (data.chart) playedChartNames.add(entryName(data.chart));
		activePoolNames = new Set(
			(data.mappool ?? [])
				.filter(e => e.status?.inCurrentPool && !e.status?.banned && !e.status?.played)
				.map(e => entryName(e))
		);
		currentChartName = null;
		clearCurrentChart();
		renderMapPool();
		const chartTitle = data.chart ? entryDisplay(data.chart) : 'Chart';
		const fp1n = data.players?.[0]?.displayName ?? 'P1';
		const fp2n = data.players?.[1]?.displayName ?? 'P2';
		const fs1 = fmtScore(data.score1, data.fc1, data.pfc1);
		const fs2 = fmtScore(data.score2, data.fc2, data.pfc2);
		addFeed(`${chartTitle}: ${fp1n} ${fs1} vs ${fp2n} ${fs2} - ${data.winner} wins!`, 'feed-win');
		break;
	}

	case 'friendly.end':
		chartIsLive = false;
		updateScoreboard(data);
		currentChartName = null;
		clearCurrentChart();
		renderMapPool();
		updatePhaseBar(null);
		if (data.winnerName) {
			showEndBanner(data.winnerName);
			addFeed(`Friendly over! ${data.winnerName} wins!`, 'feed-win');
		}
		break;

// ──────────────────────────────────────────────────────────────────
// 4. In overlay/style.css, add this to style the friendly badge
//    on the round-label element:
//
// #round-label[data-friendly]::after {
//   content: ' · Friendly';
//   font-size: 0.7em;
//   opacity: 0.6;
//   font-style: italic;
// }
// ──────────────────────────────────────────────────────────────────
