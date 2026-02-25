const {
	ComponentType,
	ContainerBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
} = require('discord.js');
const {
	saveFriendlyState,
	broadcastFriendlyState,
	pushFriendlyFeed,
	buildFriendlyMappoolEntry,
} = require('../state/friendlyMatch.js');

const accentColor = 0x40ffa0;

function chartName(entry) {
	return typeof entry === 'string' ? entry : (entry.csvName ?? entry.name ?? entry.displayName ?? '?');
}

function chartDisplay(entry) {
	return typeof entry === 'string' ? entry : (entry.displayName ?? entry.title ?? entry.csvName ?? '?');
}

function getPoolEntry(state, csvName) {
	return state.mappool.find(e => e.csvName === csvName || chartName(e) === csvName);
}

function getCurrentPool(state) {
	return state.mappool.filter(e => e.status.inCurrentPool && !e.status.banned && !e.status.played);
}

async function getCoverUrl(chart, state) {
	if (typeof chart === 'object' && chart.cover) return chart.cover;
	const name = chartName(chart);
	const entry = state.mappool.find(e => chartName(e) === name);
	return entry?.cover ?? entry?.thumbnailUrl ?? null;
}

function getPickerDisplayName(state) {
	const pickerSlot = state.currentPickerDiscordId;
	if (!pickerSlot) return state.players[0]?.displayName ?? 'Player 1';
	const p = state.players.find(p => p.displayName === pickerSlot);
	return p?.displayName ?? pickerSlot;
}

function getBanContainer(bannerName, pool, state) {
	const options = pool.map((c) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(chartDisplay(c).substring(0, 100))
			.setValue(chartName(c)),
	);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`## Friendly: ${state.players[0].displayName} vs ${state.players[1].displayName}`),
		)
		.addTextDisplayComponents((t) => t.setContent(`**${bannerName}**, ban a chart from the pool:`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new StringSelectMenuBuilder()
					.setCustomId('friendly_ban')
					.setPlaceholder('Select a chart to ban...')
					.addOptions(options),
			),
		);
}

function getPickContainer(pickerName, pool, state) {
	const options = pool.map((c) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(chartDisplay(c).substring(0, 100))
			.setValue(chartName(c)),
	);

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`## Friendly: ${state.players[0].displayName} vs ${state.players[1].displayName}`),
		);

	if (options.length > 0) {
		container
			.addTextDisplayComponents((t) => t.setContent(`**${pickerName}**, pick a chart to play:`))
			.addActionRowComponents((row) =>
				row.setComponents(
					new StringSelectMenuBuilder()
						.setCustomId('friendly_pick')
						.setPlaceholder('Select a map to play...')
						.addOptions(options),
				),
			);
	}
	else {
		container.addTextDisplayComponents((t) =>
			t.setContent('No charts remaining in the pool! (tell your referee)'),
		);
	}

	return container;
}

function getReadyCheckContainer(chartLabel, p1Name, p2Name, p1Ready, p2Ready, coverUrl = null) {
	const p1Status = p1Ready ? '✅' : '⬜';
	const p2Status = p2Ready ? '✅' : '⬜';

	const container = new ContainerBuilder().setAccentColor(accentColor);
	if (coverUrl) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(coverUrl)),
		);
	}
	container
		.addTextDisplayComponents((t) => t.setContent(`**${chartLabel}** will be played!`))
		.addTextDisplayComponents((t) => t.setContent(`${p1Status} ${p1Name}\n${p2Status} ${p2Name}`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('friendly_ready').setLabel('Ready!').setStyle(ButtonStyle.Success),
			),
		);

	return container;
}

async function startFriendlyReadyCheck(state, chart) {
	let p1Ready = false;
	let p2Ready = false;

	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

	const coverUrl = await getCoverUrl(chart, state);
	const msg = state.publicMessage;
	const name = chartName(chart);
	const entry = state.mappool.find(e => chartName(e) === name);
	const songId = entry?.songId ?? null;
	const chartLabel = songId ? `[${chartDisplay(chart)}](https://spinsha.re/song/${songId})` : `**${chartDisplay(chart)}**`;

	await msg.edit({
		components: [getReadyCheckContainer(chartLabel, state.players[0].displayName, state.players[1].displayName, p1Ready, p2Ready, coverUrl)],
		flags: MessageFlags.IsComponentsV2,
	});

	const readyCol = msg.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (j) => j.customId === 'friendly_ready',
		max: 2,
	});

	state._activeCollector = readyCol;

	const readied = new Set();

	readyCol.on('collect', async (j) => {
		if (readied.has(j.user.id)) {
			await j.reply({ content: 'You are already ready!', flags: MessageFlags.Ephemeral });
			return;
		}
		readied.add(j.user.id);
		await j.deferUpdate();

		if (!p1Ready) p1Ready = true;
		else if (!p2Ready) p2Ready = true;

		if (p1Ready && p2Ready) {
			readyCol.stop();
			state._activeCollector = null;
			state.currentChart = name;

			const entry = getPoolEntry(state, name);
			if (entry) entry.status.isBeingPlayed = true;

			await saveFriendlyState(state.refUserId);
			pushFriendlyFeed(state, 'chartStart', `Both players ready! Playing: ${chartDisplay(chart)}`);
			broadcastFriendlyState('friendly.chartStart', state);

			const countdownContainer = new ContainerBuilder().setAccentColor(accentColor);
			if (coverUrl) {
				countdownContainer.addMediaGalleryComponents(
					new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(coverUrl)),
				);
			}
			countdownContainer
				.addTextDisplayComponents((t) => t.setContent(`${chartLabel} will be played!`))
				.addTextDisplayComponents((t) => t.setContent('Both players ready! Starting countdown...'));

			await msg.edit({ components: [countdownContainer], flags: MessageFlags.IsComponentsV2 });
		}
		else {
			broadcastFriendlyState('friendly.playerReady', state, {
				p1Ready,
				p2Ready,
			});
			await msg.edit({
				components: [getReadyCheckContainer(chartLabel, state.players[0].displayName, state.players[1].displayName, p1Ready, p2Ready, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	});
}

async function startFriendlyPickPhase(interaction, state) {
	if (state.hasBans) {
		const pool = getCurrentPool(state);
		const wantedBans = pool.length - 1;

		if (wantedBans > 0) {
			const banOrder = Array.from({ length: wantedBans }, (_, i) => state.players[i % 2].displayName);
			let banTurn = 0;

			state.mappool.forEach(e => { e.status.inCurrentPool = true; });

			state.publicMessage = await interaction.followUp({
				components: [getBanContainer(banOrder[banTurn], getCurrentPool(state), state)],
				flags: MessageFlags.IsComponentsV2,
			});

			const banCol = state.publicMessage.createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				filter: (k) => k.customId === 'friendly_ban',
			});

			await new Promise((resolve) => {
				banCol.on('collect', async (k) => {
					await k.deferUpdate();
					const bannedName = k.values[0];
					const entry = getPoolEntry(state, bannedName);
					if (entry) {
						entry.status.banned = true;
						entry.status.bannedAt = new Date().toISOString();
						entry.status.inCurrentPool = false;
					}
					banTurn++;

					pushFriendlyFeed(state, 'ban', `${banOrder[banTurn - 1]} banned ${bannedName}`);
					await saveFriendlyState(state.refUserId);
					broadcastFriendlyState('friendly.ban', state, { bannedChart: bannedName, bannedByName: banOrder[banTurn - 1] });

					if (banTurn >= wantedBans) {
						banCol.stop();

						const firstPickerName = state.players[0].displayName;
						state.currentPickerDiscordId = firstPickerName;

						pushFriendlyFeed(state, 'pickPhaseStart', `Bans complete - ${firstPickerName} picks first`);
						broadcastFriendlyState('friendly.pickPhaseStart', state);

						resolve();
					}
					else {
						await state.publicMessage.edit({
							components: [getBanContainer(banOrder[banTurn], getCurrentPool(state), state)],
							flags: MessageFlags.IsComponentsV2,
						});
					}
				});
			});

			await runPickPhase(state, false, interaction);
			return;
		}
	}

	const firstPickerName = state.players[0].displayName;
	state.currentPickerDiscordId = firstPickerName;

	state.publicMessage = await interaction.followUp({
		components: [getPickContainer(firstPickerName, getCurrentPool(state), state)],
		flags: MessageFlags.IsComponentsV2,
	});

	pushFriendlyFeed(state, 'pickPhaseStart', `${firstPickerName} picks first`);
	broadcastFriendlyState('friendly.pickPhaseStart', state);

	await runPickPhase(state, true);
}

async function runPickPhase(state, skipEdit = false, _interaction = null) {
	const msg = state.publicMessage;
	const pickerName = state.currentPickerDiscordId ?? state.players[0].displayName;
	const pool = getCurrentPool(state);

	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

	if (!skipEdit) {
		await msg.edit({
			components: [getPickContainer(pickerName, pool, state)],
			flags: MessageFlags.IsComponentsV2,
		});
	}

	const pickCol = msg.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: (i) => i.customId === 'friendly_pick',
		max: 1,
	});

	state._activeCollector = pickCol;

	pickCol.on('collect', async (i) => {
		await i.deferUpdate();
		const pickedName = i.values[0];
		const entry = getPoolEntry(state, pickedName);
		state.currentChart = pickedName;

		pushFriendlyFeed(state, 'pick', `${pickerName} picked ${chartDisplay(entry ?? pickedName)}`);
		broadcastFriendlyState('friendly.pick', state, { pickedByName: pickerName });

		pickCol.stop();
		await startFriendlyReadyCheck(state, entry ?? pickedName);
	});
}

module.exports = { startFriendlyPickPhase, runPickPhase, getCurrentPool, getPoolEntry, chartName, chartDisplay };
