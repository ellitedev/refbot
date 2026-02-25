/* eslint-disable max-statements-per-line */
let ws = null;
let headerHideTimeout = null;

const defaultWsUrl = (() => {
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	if (location.protocol === 'https:') return `${scheme}://${location.host}`;
	if (typeof window.WS_PORT !== 'undefined' && window.WS_PORT) return `${scheme}://${location.hostname}:${window.WS_PORT}`;
	return `${scheme}://localhost:8080`;
})();

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('ws-url').value = defaultWsUrl;
	connect();
});

let mappool = [];
let currentChartName = null;
let chartIsLive = false;
let p1Ready = false;
let p2Ready = false;

function getEntry(csvName) {
	return mappool.find(e => e.csvName === csvName) ?? null;
}

function entryDisplay(e) {
	if (!e) return '?';
	if (typeof e === 'string') return e;
	return e.title ?? e.displayName ?? e.csvName ?? '?';
}

function connect() {
	if (ws) ws.close();
	const url = document.getElementById('ws-url').value.trim() || 'ws://localhost:8080';
	setStatus('connecting');
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
			const stateUrl = location.protocol === 'https:'
				? `${location.origin}/state`
				: `http://${location.hostname}:${window.HTTP_PORT}/state`;
			const res = await fetch(stateUrl);
			const snapshot = await res.json();
			if (snapshot) handleMessage(snapshot);
		}
		catch (error) {
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
		hideHeaderAfterDelay();
	}
	else if (s === 'error') {
		dot.classList.add('error');
		showHeader();
	}
	else {
		showHeader();
	}
	label.textContent = s;
}

function handleMessage({ event, data }) {
	if (!data) return;
	showMatchView();

	if (data.mappool?.length) mappool = data.mappool;

	switch (event) {
	case 'match.checkIn':
		updateCheckIn(data, false);
		break;

	case 'match.approved':
		updateCheckIn(data, true);
		addFeed('Check-in approved - match starting!', 'feed-pick');
		break;

	case 'match.snapshot': {
		currentChartName = data.currentChart ?? null;
		chartIsLive = data.progressLevel === 'playing';
		p1Ready = data.players?.[0]?.ready ?? false;
		p2Ready = data.players?.[1]?.ready ?? false;
		updateReadyState();
		updateScoreboard(data);
		if (currentChartName) updateCurrentChart(getEntry(currentChartName));
		else clearCurrentChart();
		renderMapPool();
		updatePhaseBarFromState(data);
		showMatchView();
		break;
	}

	case 'match.start':
		document.getElementById('checkin-banner').classList.remove('visible');
		document.getElementById('end-banner').style.display = 'none';
		currentChartName = null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed('Match started - ban phase beginning', 'feed-pick');
		showMatchView();
		break;

	case 'match.banOrderDecided': {
		const firstBanner = data.players?.find(p => p.discordId === data.firstBannerDiscordId)
			?? data.players?.find(p => p.discordId === data.banPhase?.currentBannerDiscordId);
		const fbn = firstBanner?.displayName ?? '?';
		addFeed(`${fbn} will ban first`, 'feed-ban');
		updatePhaseBar('banning', `${fbn} is banning...`);
		updateScoreboard(data);
		renderMapPool();
		break;
	}

	case 'match.ban': {
		const banner = data.players?.find(p => p.discordId === data.bannedByDiscordId);
		const bannerName = banner?.displayName ?? 'Someone';
		const bannedEntry = data.mappool?.find(e => e.csvName === data.bannedChart);
		const bannedDisplay = bannedEntry ? entryDisplay(bannedEntry) : data.bannedChart;
		addFeed(`${bannerName} banned ${bannedDisplay}`, 'feed-ban');
		const nextBanner = data.players?.find(p => p.discordId === data.banPhase?.currentBannerDiscordId);
		if (nextBanner) {
			updatePhaseBar('banning', `${nextBanner.displayName} is banning...`);
		}
		else {
			updatePhaseBar(null);
		}
		updateScoreboard(data);
		renderMapPool();
		break;
	}

	case 'match.firstChartDetermined': {
		const entry = getEntry(data.chart ?? data.currentChart);
		currentChartName = data.chart ?? data.currentChart ?? null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		if (entry) updateCurrentChart(entry);
		renderMapPool();
		addFeed(`Last map standing: ${entry ? entryDisplay(entry) : currentChartName}`, 'feed-pick');
		updatePhaseBar('playing', `Ready check: ${entry ? entryDisplay(entry) : '...'}`);
		break;
	}

	case 'match.pickPhaseStart': {
		const firstPicker = data.players?.find(p => p.discordId === data.currentPickerDiscordId);
		const fpn = firstPicker?.displayName ?? '?';
		updatePhaseBar('picking', `${fpn} is picking...`);
		updateScoreboard(data);
		renderMapPool();
		clearCurrentChart();
		addFeed(`Bans complete - ${fpn} picks first`, 'feed-pick');
		break;
	}

	case 'match.pick': {
		currentChartName = data.currentChart ?? null;
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		const pickedEntry = currentChartName ? getEntry(currentChartName) : null;
		if (pickedEntry) updateCurrentChart(pickedEntry);
		renderMapPool();
		if (pickedEntry) {
			const picker = data.players?.find(p => p.discordId === data.pickedByDiscordId);
			const pn = picker?.displayName ?? '?';
			addFeed(`${pn} picked ${entryDisplay(pickedEntry)}`, 'feed-pick');
		}
		updatePhaseBar('playing', `Ready check: ${pickedEntry ? entryDisplay(pickedEntry) : '...'}`);
		break;
	}

	case 'match.playerReady': {
		const prevP1Ready = p1Ready;
		const prevP2Ready = p2Ready;
		p1Ready = data.players?.[0]?.ready ?? false;
		p2Ready = data.players?.[1]?.ready ?? false;
		updateReadyState();
		const newlyReadyName = !prevP1Ready && p1Ready
			? (data.players?.[0]?.displayName ?? 'P1')
			: !prevP2Ready && p2Ready
				? (data.players?.[1]?.displayName ?? 'P2')
				: null;
		if (newlyReadyName) addFeed(`${newlyReadyName} is ready!`, 'feed-win');
		break;
	}

	case 'match.chartStart': {
		p1Ready = true;
		p2Ready = true;
		updateReadyState();
		currentChartName = data.currentChart ?? currentChartName;
		chartIsLive = true;
		updateScoreboard(data);
		const liveEntry = currentChartName ? getEntry(currentChartName) : null;
		if (liveEntry) updateCurrentChart(liveEntry);
		renderMapPool();
		if (liveEntry) addFeed(`Now playing: ${entryDisplay(liveEntry)}`, 'feed-pick');
		updatePhaseBar('playing', `Playing: ${liveEntry ? entryDisplay(liveEntry) : '...'}`);
		break;
	}

	case 'match.chartResult': {
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
		const resultEntry = (data.mappool ?? [])
			.filter(e => e.status?.played && e.result)
			.sort((a, b) => new Date(b.status.playedAt) - new Date(a.status.playedAt))[0] ?? null;
		currentChartName = null;
		clearCurrentChart();
		renderMapPool();
		const chartTitle = resultEntry ? entryDisplay(resultEntry) : 'Chart';
		const p1n = data.players?.[0]?.displayName ?? 'P1';
		const p2n = data.players?.[1]?.displayName ?? 'P2';
		const result = resultEntry?.result ?? {};
		const s1 = fmtScore(result.score1, result.fc1, result.pfc1);
		const s2 = fmtScore(result.score2, result.fc2, result.pfc2);
		const winnerPlayer = data.players?.find(p => p.discordId === result.winnerDiscordId);
		addFeed(`${chartTitle}: ${p1n} ${s1} vs ${p2n} ${s2} - ${winnerPlayer?.displayName ?? 'someone'} wins!`, 'feed-win');
		const nextPicker = data.players?.find(p => p.discordId === data.currentPickerDiscordId);
		if (nextPicker) updatePhaseBar('picking', `${nextPicker.displayName} is picking...`);
		break;
	}

	case 'match.end':
		chartIsLive = false;
		p1Ready = false;
		p2Ready = false;
		updateReadyState();
		updateScoreboard(data);
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
		if (data.currentChart) {
			currentChartName = data.currentChart;
			updateCurrentChart(getEntry(currentChartName));
		}
		renderMapPool();
	}
}

function updatePhaseBarFromState(data) {
	const level = data.progressLevel;
	if (level === 'ban-phase') {
		const banner = data.players?.find(p => p.discordId === data.banPhase?.currentBannerDiscordId);
		if (banner) updatePhaseBar('banning', `${banner.displayName} is banning...`);
		else updatePhaseBar(null);
	}
	else if (level === 'picking-post-result') {
		const picker = data.players?.find(p => p.discordId === data.currentPickerDiscordId);
		if (picker) updatePhaseBar('picking', `${picker.displayName} is picking...`);
		else updatePhaseBar(null);
	}
	else if (level === 'playing') {
		const entry = data.currentChart ? getEntry(data.currentChart) : null;
		updatePhaseBar('playing', `Playing: ${entry ? entryDisplay(entry) : '...'}`);
	}
	else {
		updatePhaseBar(null);
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
		if (p.displayName) document.getElementById('p1-name').textContent = p.displayName;
		if (p.discordDisplayName) document.getElementById('p1-label').textContent = p.discordDisplayName;
		if (p.discordUsername) document.getElementById('p1-username').textContent = `@${p.discordUsername}`;
		const av = document.getElementById('p1-avatar');
		if (p.avatarUrl) { av.src = p.avatarUrl; av.style.display = 'block'; }
	}
	if (data.players?.[1]) {
		const p = data.players[1];
		if (p.displayName) document.getElementById('p2-name').textContent = p.displayName;
		if (p.discordDisplayName) document.getElementById('p2-label').textContent = p.discordDisplayName;
		if (p.discordUsername) document.getElementById('p2-username').textContent = `@${p.discordUsername}`;
		const av = document.getElementById('p2-avatar');
		if (p.avatarUrl) { av.src = p.avatarUrl; av.style.display = 'block'; }
	}
	const p0pts = data.players?.[0]?.points ?? 0;
	const p1pts = data.players?.[1]?.points ?? 0;
	document.getElementById('score-display').textContent = `${p0pts} - ${p1pts}`;
	if (data.meta?.round) document.getElementById('round-label').textContent = data.meta.round;
	if (data.meta?.bestOf) document.getElementById('bo-label').textContent = `Best of ${data.meta.bestOf}`;
}

function updateCurrentChart(entry) {
	if (!entry) return;
	const card = document.getElementById('current-chart-card');
	card.classList.add('active');
	const thumb = document.getElementById('chart-thumb');
	const imgSrc = entry.thumbnailUrl ?? entry.cover ?? '';
	if (imgSrc) { thumb.src = imgSrc; thumb.style.display = 'block'; }
	else { thumb.style.display = 'none'; }
	document.getElementById('chart-title').textContent = entry.title ?? entry.displayName ?? 'Unknown';
	document.getElementById('chart-artist').textContent = entry.artist ?? '';
	document.getElementById('chart-charter').textContent = entry.charter ? `charted by ${entry.charter}` : '';
	const diff = document.getElementById('chart-difficulty');
	if (entry.difficulty != null) { diff.style.display = 'block'; diff.textContent = `Diff ${entry.difficulty}`; }
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

	if (!mappool.length) return;

	mappool.forEach(entry => {
		const { csvName, title, artist, thumbnailUrl, cover, displayName, status, result } = entry;
		const display = title ?? displayName ?? csvName ?? '?';
		const thumb = thumbnailUrl ?? cover ?? '';
		const isBanned = status?.banned ?? false;
		const isPlayed = status?.played ?? false;
		const isLive = status?.isBeingPlayed ?? false;
		const isCurrent = csvName === currentChartName;

		const chip = document.createElement('div');
		chip.className = 'map-chip';

		if (isBanned) chip.classList.add('banned');
		else if (isPlayed) chip.classList.add('played');
		else if (isLive || isCurrent) chip.classList.add('active');

		if (thumb) {
			const img = document.createElement('img');
			img.className = 'map-chip-thumb';
			img.src = thumb;
			chip.appendChild(img);
		}

		if (isPlayed && result) {
			const res = document.createElement('div');
			res.className = 'map-chip-result';
			const s1 = fmtScore(result.score1, result.fc1, result.pfc1);
			const s2 = fmtScore(result.score2, result.fc2, result.pfc2);
			res.textContent = `${s1} / ${s2}`;
			chip.appendChild(res);
		}
		else if (isBanned) {
			const tag = document.createElement('div');
			tag.className = 'map-chip-tag';
			tag.textContent = 'BANNED';
			chip.appendChild(tag);
		}
		else if (isLive || isCurrent) {
			const tag = document.createElement('div');
			tag.className = 'map-chip-tag';
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
	if (headerHideTimeout) clearTimeout(headerHideTimeout);
	headerHideTimeout = setTimeout(() => {
		const header = document.getElementById('main-header');
		const wsDot = document.getElementById('ws-dot');
		if (wsDot.classList.contains('connected')) header.classList.add('hidden');
	}, 1000);
}

function showHeader() {
	const header = document.getElementById('main-header');
	header.classList.remove('hidden');
	hideHeaderAfterDelay();
}

document.addEventListener('mousemove', (e) => {
	if (e.clientY < 50) showHeader();
});
