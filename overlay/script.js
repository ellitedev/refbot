/* eslint-disable max-statements-per-line */
let ws = null;
let headerHideTimeout = null;

const defaultWsUrl = (() => {
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	// In production behind Traefik (HTTPS), prefer connecting to the same host (no port): wss://refbot.ellite.dev
	if (location.protocol === 'https:') return `${scheme}://${location.host}`;
	// In dev (HTTP) prefer an explicit WS port when provided (e.g. docker compose mapped port)
	if (typeof window.WS_PORT !== 'undefined' && window.WS_PORT) return `${scheme}://${location.hostname}:${window.WS_PORT}`;
	// Fallback to localhost default for simple local dev
	return `${scheme}://localhost:8080`;
})();

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('ws-url').value = defaultWsUrl;
	connect();
});

// track full pool so we can infer bans from shrinking currentMapPool
let fullMapPool = [];
// name -> chart data object, populated from any pool data we receive
const chartDataCache = {};
// name of the currently picked/playing chart
let currentChartName = null;
// set of names that have been played (finished with a result)
let playedChartNames = new Set();
// set of names currently in the active map pool (shrinks as bans happen)
let activePoolNames = new Set();
// set of names that have been explicitly banned (from match.ban events)
let bannedChartNames = new Set();
// whether a chart is actively being played right now
let chartIsLive = false;
// ready state during ready check phase
let p1Ready = false;
let p2Ready = false;

function entryName(e) {
	return typeof e === 'string' ? e : (e.csvName ?? e.displayName ?? e.name ?? '?');
}

function entryDisplay(e) {
	return typeof e === 'string' ? e : (e.title ?? e.displayName ?? e.name ?? '?');
}

function cacheChartData(pool) {
	(pool ?? []).forEach(e => {
		if (typeof e === 'object') {
			const n = entryName(e);
			if (n && n !== '?') chartDataCache[n] = e;
		}
	});
}

function connect() {
	if (ws) ws.close();
	const url = document.getElementById('ws-url').value.trim() || 'ws://localhost:8080';
	setStatus('connecting');
	// If the page is served over HTTPS, force a secure WebSocket scheme.
	let connectUrl = url;
	if (location.protocol === 'https:' && connectUrl.startsWith('ws://')) {
		connectUrl = connectUrl.replace(/^ws:/, 'wss:');
	}
	try {
		ws = new WebSocket(connectUrl);
	}
	catch (err) {
		console.error('WebSocket connection failed', err);
		setStatus('error');
		document.getElementById('waiting').innerHTML = `<div>Connection failed: ${err.message}</div><div class="sub">Use a secure WSS URL when the page is served over HTTPS.</div>`;
		return;
	}
	ws.onopen = async () => {
		setStatus('connected');
		document.getElementById('waiting').innerHTML = '<div>Connected! Waiting for a match to start...</div><div class="sub">No match is currently in progress</div>';
		try {
			const httpPort = window.HTTP_PORT ?? '8081';
			const res = await fetch(`http://${location.hostname}:${httpPort}/state`);
			const snapshot = await res.json();
			if (snapshot) handleMessage(snapshot);
		}
		catch (error) {
			// Silently fail - initial state fetch is optional
			console.debug('Failed to fetch initial state:', error);
		}
	};
	ws.onclose = () => {
		setStatus('disconnected');
		document.getElementById('waiting').innerHTML = '<div>Disconnected.</div><div class="sub">Enter a WebSocket URL and click Connect</div>';
		document.getElementById('waiting').style.display = '';
		document.getElementById('match-view').style.display = 'none';
		document.getElementById('checkin-banner').classList.remove('visible');
	};
	ws.onerror = () => setStatus('error');
	ws.onmessage = (e) => {
		try {
			handleMessage(JSON.parse(e.data));
		}
		catch (error) {
			console.error('Failed to parse message:', error);
		}
	};
}

function setStatus(s) {
	const dot = document.getElementById('ws-dot');
	const label = document.getElementById('ws-label');
	dot.className = '';
	if (s === 'connected') {
		dot.classList.add('connected');
		// Start the hide timer when connected
		hideHeaderAfterDelay();
	}
	else if (s === 'error') {
		dot.classList.add('error');
		// Show header on error
		showHeader();
	}
	else {
		// Show header on disconnect
		showHeader();
	}
	label.textContent = s;
}

function handleMessage({ event, data }) {
	if (!data) return;
	showMatchView();
	cacheChartData(data.currentMapPool);
	cacheChartData(data.playedCharts);
	cacheChartData(data.fullMapPool);

	switch (event) {
	case 'match.checkIn':
		updateCheckIn(data, false);
		break;

	case 'match.approved':
		updateCheckIn(data, true);
		addFeed('Check-in approved - match starting!', 'feed-pick');
		break;

	case 'match.snapshot':
		// restore full state on reconnect
		if (data.fullMapPool?.length) {
			fullMapPool = [...data.fullMapPool];
			cacheChartData(fullMapPool);
		}
		if (data.bannedCharts) bannedChartNames = new Set(data.bannedCharts.map(b => typeof b === 'string' ? b : b.name));
		playedChartNames = new Set((data.playedCharts ?? []).map(c => typeof c === 'string' ? c : c.name));
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		currentChartName = data.currentChart ? entryName(data.currentChart) : null;
		chartIsLive = !!data.currentChart;
		updateScoreboard(data);
		if (data.currentChart) updateCurrentChart(data.currentChart);
		renderMapPool();
		showMatchView();
		break;

	case 'match.banOrderDecided': {
		const firstBanner = data.currentBanner ?? data.players?.find(p => p.discordId === data.firstBannerDiscordId);
		const fbn = firstBanner?.displayName ?? firstBanner?.name ?? '?';
		addFeed(`${fbn} will ban first`, 'feed-ban');
		updatePhaseBar('banning', `${fbn} is banning...`);
		updateScoreboard(data);
		renderMapPool();
		break;
	}

	case 'match.ban': {
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		if (data.bannedChart) bannedChartNames.add(data.bannedChart);
		const banner = data.players?.find(p => p.discordId === data.bannedByDiscordId);
		const bannerName = banner?.displayName ?? banner?.name ?? 'Someone';
		addFeed(`${bannerName} banned ${data.bannedChart}`, 'feed-ban');
		const nextBanner = data.currentBanner;
		if (nextBanner?.discordId) {
			const nbn = nextBanner.displayName ?? nextBanner.name ?? '?';
			updatePhaseBar('banning', `${nbn} is banning...`);
		}
		else {
			updatePhaseBar(null);
		}
		updateScoreboard(data);
		renderMapPool();
		break;
	}

	case 'match.start':
		document.getElementById('checkin-banner').classList.remove('visible');
		document.getElementById('end-banner').style.display = 'none';
		fullMapPool = [...(data.fullMapPool?.length ? data.fullMapPool : (data.currentMapPool ?? []))];
		cacheChartData(fullMapPool);
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		playedChartNames = new Set();
		bannedChartNames = new Set();
		currentChartName = null;
		chartIsLive = false;
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed('Match started - ban phase beginning', 'feed-pick');
		showMatchView();
		break;

	case 'match.pickPhaseStart': {
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		const firstPicker = data.currentPicker;
		const fpn = firstPicker?.displayName ?? firstPicker?.name ?? '?';
		updatePhaseBar('picking', `${fpn} is picking...`);
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed(`Bans complete - ${fpn} picks first`, 'feed-pick');
		break;
	}

	case 'match.pick': {
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		currentChartName = data.currentChart ? entryName(data.currentChart) : null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		if (data.currentChart) updateCurrentChart(data.currentChart);
		renderMapPool();
		if (data.currentChart) {
			const picker = data.players?.find(p => p.discordId === data.pickedByDiscordId);
			const pn = picker?.displayName ?? picker?.name ?? '?';
			const cn = entryDisplay(data.currentChart);
			addFeed(`${pn} picked ${cn}`, 'feed-pick');
		}
		updatePhaseBar('playing', `Playing: ${data.currentChart ? entryDisplay(data.currentChart) : '...'}`);
		break;
	}

	case 'match.playerReady':
		p1Ready = data.p1Ready ?? false;
		p2Ready = data.p2Ready ?? false;
		updateReadyState();
		addFeed(`${data.p1Ready && !data.p2Ready
			? (data.players?.[0]?.displayName ?? data.players?.[0]?.name ?? 'P1')
			: (data.players?.[1]?.displayName ?? data.players?.[1]?.name ?? 'P2')} is ready!`, 'feed-win');
		break;

	case 'match.chartStart':
		p1Ready = true;
		p2Ready = true;
		updateReadyState();
		// both players readied up
		currentChartName = data.currentChart ? entryName(data.currentChart) : currentChartName;
		chartIsLive = true;
		updateScoreboard(data);
		if (data.currentChart) updateCurrentChart(data.currentChart);
		renderMapPool();
		if (data.currentChart) {
			const n = entryDisplay(data.currentChart);
			addFeed(`Now playing: ${n}`, 'feed-pick');
		}
		break;

	case 'match.chartResult': {
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		if (data.chart) playedChartNames.add(entryName(data.chart));
		activePoolNames = new Set((data.currentMapPool ?? []).map(entryName));
		currentChartName = null;
		clearCurrentChart();
		renderMapPool();
		const chartTitle = data.chart ? entryDisplay(data.chart) : 'Chart';
		const p1n = data.players?.[0]?.displayName ?? data.players?.[0]?.name ?? 'P1';
		const p2n = data.players?.[1]?.displayName ?? data.players?.[1]?.name ?? 'P2';
		const s1 = fmtScore(data.score1, data.fc1, data.pfc1);
		const s2 = fmtScore(data.score2, data.fc2, data.pfc2);
		addFeed(`${chartTitle}: ${p1n} ${s1} vs ${p2n} ${s2} - ${data.winner} wins!`, 'feed-win');
		const nextPicker = data.currentPicker;
		if (nextPicker?.discordId) {
			const npn = nextPicker.displayName ?? nextPicker.name ?? '?';
			updatePhaseBar('picking', `${npn} is picking...`);
		}
		break;
	}

	case 'match.end':
		chartIsLive = false;
		updateScoreboard(data);
		if (data.chart) playedChartNames.add(entryName(data.chart));
		currentChartName = null;
		clearCurrentChart();
		renderMapPool();
		updatePhaseBar(null);
		if (data.winner) {
			showEndBanner(data.winner);
			addFeed(`Match over! ${data.winner} wins!`, 'feed-end');
		}
		break;

	default:
		updateScoreboard(data);
		if (data.currentChart) updateCurrentChart(data.currentChart);
		if (data.currentMapPool) activePoolNames = new Set(data.currentMapPool.map(entryName));
		renderMapPool();
	}
}

function fmtScore(score, fc, pfc) {
	if (score == null) return '?';
	let s = Number(score).toLocaleString();
	if (pfc) s += ' [PFC]';
	else if (fc) s += ' [FC]';
	return s;
}

function updateCheckIn(data, approved) {
	const banner = document.getElementById('checkin-banner');
	banner.classList.add('visible');
	document.getElementById('waiting').style.display = 'none';

	const names = data.playerNames ?? ['Player 1', 'Player 2'];
	document.getElementById('ci-p1-name').textContent = names[0];
	document.getElementById('ci-p2-name').textContent = names[1];

	const p1El = document.getElementById('ci-p1');
	const p2El = document.getElementById('ci-p2');
	const p1Status = document.getElementById('ci-p1-status');
	const p2Status = document.getElementById('ci-p2-status');

	p1El.className = 'checkin-player';
	p2El.className = 'checkin-player';

	if (approved) {
		p1El.classList.add('approved');
		p2El.classList.add('approved');
		p1Status.textContent = 'Approved';
		p2Status.textContent = 'Approved';
	}
	else {
		if (data.p1CheckedIn) { p1El.classList.add('checked'); p1Status.textContent = 'Checked In'; }
		else { p1Status.textContent = 'Waiting'; }
		if (data.p2CheckedIn) { p2El.classList.add('checked'); p2Status.textContent = 'Checked In'; }
		else { p2Status.textContent = 'Waiting'; }
	}

	if (data.p1CheckedIn && !approved) addFeed(`${names[0]} checked in`, 'feed-pick');
	if (data.p2CheckedIn && !data.p1CheckedIn && !approved) addFeed(`${names[1]} checked in`, 'feed-pick');
}

function showMatchView() {
	document.getElementById('waiting').style.display = 'none';
	document.getElementById('match-view').style.display = 'flex';
}

function updatePhaseBar(mode, text) {
	const bar = document.getElementById('phase-bar');
	const icon = document.getElementById('phase-bar-icon');
	const label = document.getElementById('phase-bar-text');
	if (!mode) { bar.style.display = 'none'; return; }
	bar.style.display = 'flex';
	bar.className = `phase-bar ${mode}`;
	icon.textContent = mode === 'banning' ? 'BAN' : mode === 'picking' ? 'PICK' : 'LIVE';
	label.textContent = text;
}

function updateReadyState() {
	const p1av = document.getElementById('p1-avatar');
	const p2av = document.getElementById('p2-avatar');
	p1av.classList.toggle('ready', p1Ready);
	p2av.classList.toggle('ready', p2Ready);
}

function updateScoreboard(data) {
	if (data.players?.[0]) {
		const p = data.players[0];
		if (p.displayName ?? p.name) document.getElementById('p1-name').textContent = p.displayName ?? p.name;
		if (p.name) document.getElementById('p1-label').textContent = p.name;
		if (p.username) document.getElementById('p1-username').textContent = `@${p.username}`;
		const av = document.getElementById('p1-avatar');
		if (p.avatar) { av.src = p.avatar; av.style.display = 'block'; }
	}
	if (data.players?.[1]) {
		const p = data.players[1];
		if (p.displayName ?? p.name) document.getElementById('p2-name').textContent = p.displayName ?? p.name;
		if (p.name) document.getElementById('p2-label').textContent = p.name;
		if (p.username) document.getElementById('p2-username').textContent = `@${p.username}`;
		const av = document.getElementById('p2-avatar');
		if (p.avatar) { av.src = p.avatar; av.style.display = 'block'; }
	}
	if (data.score) document.getElementById('score-display').textContent = `${data.score[0]} - ${data.score[1]}`;
	if (data.round) document.getElementById('round-label').textContent = data.round;
	if (data.bestOf) document.getElementById('bo-label').textContent = `Best of ${data.bestOf}`;
}

function updateCurrentChart(chart) {
	if (!chart) return;
	const card = document.getElementById('current-chart-card');
	card.classList.add('active');
	const thumb = document.getElementById('chart-thumb');
	const imgSrc = chart.thumbnailUrl ?? chart.cover ?? '';
	if (imgSrc) { thumb.src = imgSrc; thumb.style.display = 'block'; }
	else { thumb.style.display = 'none'; }
	document.getElementById('chart-title').textContent = chart.title ?? chart.displayName ?? 'Unknown';
	document.getElementById('chart-artist').textContent = chart.artist ?? '';
	document.getElementById('chart-charter').textContent = chart.charter ? `charted by ${chart.charter}` : '';
	const diff = document.getElementById('chart-difficulty');
	if (chart.difficulty != null) { diff.style.display = 'block'; diff.textContent = `Diff ${chart.difficulty}`; }
	else { diff.style.display = 'none'; }
}

function clearCurrentChart() {
	document.getElementById('current-chart-card').classList.remove('active');
	document.getElementById('chart-title').textContent = 'No chart selected';
	document.getElementById('chart-artist').textContent = '';
	document.getElementById('chart-charter').textContent = '';
	document.getElementById('chart-thumb').style.display = 'none';
	document.getElementById('chart-difficulty').style.display = 'none';
}

function renderMapPool() {
	const grid = document.getElementById('mappool-grid');
	grid.innerHTML = '';

	// use fullMapPool as the source of truth for what to show
	// fall back to activePoolNames contents if fullMapPool is empty (e.g. mid-session connect)
	const source = fullMapPool.length > 0
		? fullMapPool
		: [...activePoolNames].map(n => chartDataCache[n] ?? n);

	source.forEach(entry => {
		const name = entryName(entry);
		const cached = chartDataCache[name] ?? (typeof entry === 'object' ? entry : null);
		const display = cached ? entryDisplay(cached) : name;
		const artist = cached?.artist ?? '';
		const thumb = cached?.thumbnailUrl ?? cached?.cover ?? '';

		const isPlayed = playedChartNames.has(name);
		const isBanned = !isPlayed && (bannedChartNames.has(name) || (!activePoolNames.has(name) && fullMapPool.length > 0));
		// during chart play, dim everything except the current chart
		const isDimmed = chartIsLive && currentChartName && name !== currentChartName;
		const isCurrent = name === currentChartName;

		const chip = document.createElement('div');
		const classes = ['map-chip'];
		if (isPlayed) classes.push('played');
		else if (isBanned) classes.push('banned');
		else if (isDimmed) classes.push('dimmed');
		if (isCurrent) classes.push('current');
		chip.className = classes.join(' ');

		if (thumb) {
			const img = document.createElement('img');
			img.className = 'map-chip-thumb';
			img.src = thumb;
			img.alt = display;
			chip.appendChild(img);
		}

		if (isBanned) {
			const tag = document.createElement('div');
			tag.className = 'chip-tag banned-tag';
			tag.textContent = 'BANNED';
			chip.appendChild(tag);
		}
		else if (isPlayed) {
			const tag = document.createElement('div');
			tag.className = 'chip-tag played-tag';
			tag.textContent = 'PLAYED';
			chip.appendChild(tag);
		}
		else if (isCurrent) {
			const tag = document.createElement('div');
			tag.className = 'chip-tag current-tag';
			tag.textContent = chartIsLive ? 'LIVE' : 'PICKED';
			chip.appendChild(tag);
		}

		const nameEl = document.createElement('div');
		nameEl.className = 'map-chip-name';
		nameEl.textContent = display;
		chip.appendChild(nameEl);

		if (artist) {
			const sub = document.createElement('div');
			sub.className = 'map-chip-sub';
			sub.textContent = artist;
			chip.appendChild(sub);
		}

		grid.appendChild(chip);
	});
}

function showEndBanner(winner) {
	const banner = document.getElementById('end-banner');
	banner.style.display = 'block';
	document.getElementById('end-winner').textContent = winner;
}

function addFeed(text, cls) {
	const feed = document.getElementById('event-feed');
	const item = document.createElement('div');
	item.className = 'feed-item';
	const now = new Date();
	const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
	item.innerHTML = `<span class="feed-time">${time}</span><span class="feed-text ${cls || ''}">${text}</span>`;
	feed.prepend(item);
}

function hideHeaderAfterDelay() {
	if (headerHideTimeout) {
		clearTimeout(headerHideTimeout);
	}
	headerHideTimeout = setTimeout(() => {
		const header = document.getElementById('main-header');
		const wsDot = document.getElementById('ws-dot');
		// Only hide if connected
		if (wsDot.classList.contains('connected')) {
			header.classList.add('hidden');
		}
	}, 1000);
}

function showHeader() {
	const header = document.getElementById('main-header');
	header.classList.remove('hidden');
	// Reset the hide timer
	hideHeaderAfterDelay();
}
// Add mouse move listener to show header when mouse moves near top
document.addEventListener('mousemove', (e) => {
	if (e.clientY < 50) {
		showHeader();
	}
});