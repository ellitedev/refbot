const { MessageFlags, ComponentType, ContainerBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { saveFriendlyState } = require('../state/friendlyMatch.js');
const ChartModel = require('../models/Chart.js');

const accentColor = 0x40ffa0;

async function getCoverUrl(chartName, state) {
	if (!chartName) return null;
	try {
		const songId = state?.chartSongIds?.[chartName] ?? null;
		const doc = songId
			? await ChartModel.findOne({ songId })
			: await ChartModel.findOne({ csvName: chartName });
		return doc?.cover ?? null;
	}
	catch {
		return null;
	}
}

function getScoreStr(state) {
	return `**${state.playerNames[0]}** ${state.score[0]} - ${state.score[1]} **${state.playerNames[1]}** *(Best of ${state.bestOf})*`;
}

function getBanContainer(banner, currentMapPool, state) {
	const mapPoolStr = currentMapPool.map((m) => `- ${m}`).join('\n');
	const options = currentMapPool.map((m) => new StringSelectMenuOptionBuilder().setLabel(m).setValue(m));

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(getScoreStr(state)))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(`**Map Pool:**\n${mapPoolStr}`))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(`**${banner}**, it is your turn to ban! (tell your referee)`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new StringSelectMenuBuilder()
					.setCustomId('friendly_ban')
					.setPlaceholder('Select a map to ban...')
					.addOptions(options),
			),
		);
}

function getPickContainer(picker, currentMapPool, state) {
	const mapPoolStr = currentMapPool.map((m) => `- ${m}`).join('\n');

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(getScoreStr(state)))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(`**Map Pool:**\n${mapPoolStr}`))
		.addSeparatorComponents((s) => s);

	if (currentMapPool.length === 1) {
		container.addTextDisplayComponents((t) =>
			t.setContent(`The map to be played is **${currentMapPool[0]}**!`),
		);
	}
	else {
		const options = currentMapPool.map((m) => new StringSelectMenuOptionBuilder().setLabel(m).setValue(m));
		container
			.addTextDisplayComponents((t) => t.setContent(`**${picker}**, it is your turn to pick! (tell your referee)`))
			.addActionRowComponents((row) =>
				row.setComponents(
					new StringSelectMenuBuilder()
						.setCustomId('friendly_pick')
						.setPlaceholder('Select a map to play...')
						.addOptions(options),
				),
			);
	}

	return container;
}

function getReadyCheckContainer(chart, p1Name, p2Name, p1Ready, p2Ready, coverUrl = null) {
	const p1Status = p1Ready ? '✅' : '⬜';
	const p2Status = p2Ready ? '✅' : '⬜';

	const container = new ContainerBuilder().setAccentColor(accentColor);
	if (coverUrl) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(coverUrl)),
		);
	}
	container
		.addTextDisplayComponents((t) => t.setContent(`**${chart}** will be played!`))
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
	const songId = state.chartSongIds?.[chart] ?? null;
	const chartLink = songId ? `[${chart}](https://spinsha.re/song/${songId})` : `**${chart}**`;

	await msg.edit({
		components: [getReadyCheckContainer(chartLink, state.playerNames[0], state.playerNames[1], p1Ready, p2Ready, coverUrl)],
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
			state.currentChart = chart;
			await saveFriendlyState(state.refUserId);

			const countdownContainer = new ContainerBuilder().setAccentColor(accentColor);
			if (coverUrl) {
				countdownContainer.addMediaGalleryComponents(
					new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(coverUrl)),
				);
			}
			countdownContainer
				.addTextDisplayComponents((t) => t.setContent(`${chartLink} will be played!`))
				.addTextDisplayComponents((t) => t.setContent('Both players ready! Starting countdown...'));

			await msg.edit({ components: [countdownContainer], flags: MessageFlags.IsComponentsV2 });
		}
		else {
			await msg.edit({
				components: [getReadyCheckContainer(chartLink, state.playerNames[0], state.playerNames[1], p1Ready, p2Ready, coverUrl)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	});
}

async function startFriendlyPickPhase(interaction, state) {
	if (state.hasBans && state.currentMapPool.length > state.bestOf) {
		const totalBans = state.currentMapPool.length - 1;
		const banOrder = Array.from({ length: totalBans }, (_, i) => state.playerNames[i % 2]);
		let banTurn = 0;
		let currentMapPool = [...state.currentMapPool];

		state.publicMessage = await interaction.followUp({
			components: [getBanContainer(banOrder[banTurn], currentMapPool, state)],
			flags: MessageFlags.IsComponentsV2,
		});

		const banCol = state.publicMessage.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: (k) => k.customId === 'friendly_ban',
		});

		await new Promise((resolve) => {
			banCol.on('collect', async (k) => {
				await k.deferUpdate();
				currentMapPool = currentMapPool.filter((m) => m !== k.values[0]);
				banTurn++;

				if (banTurn >= totalBans) {
					banCol.stop();
					state.currentMapPool = [...currentMapPool];
					state.currentChart = currentMapPool[0];
					await saveFriendlyState(state.refUserId);
					resolve();
				}
				else {
					await state.publicMessage.edit({
						components: [getBanContainer(banOrder[banTurn], currentMapPool, state)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			});
		});

		await startFriendlyReadyCheck(state, state.currentChart);
	}
	else {
		const pickerName = state.currentPicker ?? state.playerNames[0];
		state.publicMessage = await interaction.followUp({
			components: [getPickContainer(pickerName, state.currentMapPool, state)],
			flags: MessageFlags.IsComponentsV2,
		});
		await runPickPhase(state, true);
	}
}

async function runPickPhase(state, skipEdit = false) {
	const msg = state.publicMessage;
	const pickerName = state.currentPicker ?? state.playerNames[0];

	if (state._activeCollector) {
		state._activeCollector.stop();
		state._activeCollector = null;
	}

	if (!skipEdit) {
		await msg.edit({
			components: [getPickContainer(pickerName, state.currentMapPool, state)],
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
		const picked = i.values[0];
		state.currentChart = picked;
		pickCol.stop();
		await startFriendlyReadyCheck(state, picked);
	});
}

module.exports = { startFriendlyPickPhase, runPickPhase };
