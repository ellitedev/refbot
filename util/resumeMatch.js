const { MessageFlags, ComponentType } = require('discord.js');
const {
	getPickContainer,
	getReadyCheckContainer,
	getCountdownContainer,
	getSimpleContainer,
} = require('../ui/matchContainers.js');
const { startPickPhase, getCurrentPool, getScore, getPlayerNames } = require('./matchFlow.js');
const { restoreMatchState, saveMatchState } = require('../state/match.js');

async function resumeMatch(client, doc, matchStateRef) {
	try {
		let channel;
		try {
			channel = await client.channels.fetch(doc.meta.channelId);
		}
		catch {
			console.error(`[resume] Could not fetch channel ${doc.meta.channelId}`);
			return false;
		}

		const discordUsersMap = new Map();

		for (const player of doc.players) {
			if (player.discordId) {
				try {
					const user = await client.users.fetch(player.discordId);
					discordUsersMap.set(player.discordId, user);
				}
				catch {
					console.error(`[resume] Could not fetch discord user ${player.discordId}`);
				}
			}
		}

		const state = await restoreMatchState(doc);

		Object.assign(matchStateRef, state);

		const fakeInteraction = makeFakeInteraction(null, channel);
		matchStateRef.interaction = fakeInteraction;
		matchStateRef._discordUsersMap = discordUsersMap;

		const currentPool = getCurrentPool(state);

		if (currentPool.length === 0) {
			console.error('[resume] Current pool resolved to 0 charts — match may already be complete.');
			return false;
		}

		let resumeMsg;

		if (state.currentChart) {
			const entry = state.mappool.find(c => c.csvName === state.currentChart);
			const chart = entry ?? { csvName: state.currentChart, displayName: state.currentChart };
			const coverUrl = entry?.thumbnailUrl ?? entry?.cover ?? null;

			const p1DiscordUser = discordUsersMap.get(state.players[0].discordId);
			const p2DiscordUser = discordUsersMap.get(state.players[1].discordId);

			resumeMsg = await channel.send({
				components: [getReadyCheckContainer(chart, p1DiscordUser, p2DiscordUser, false, false, true)],
				flags: MessageFlags.IsComponentsV2,
			});

			const updatedFakeInteraction = makeFakeInteraction(resumeMsg, channel);
			matchStateRef.interaction = updatedFakeInteraction;
			state.interaction = updatedFakeInteraction;

			const readyCol = resumeMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				filter: (j) => state.players.some(p => p.discordId === j.user.id) && j.customId === 'ready',
			});

			const readied = new Set();

			readyCol.on('collect', async (j) => {
				if (readied.has(j.user.id)) {
					await j.reply({ content: 'You\'re already ready!', flags: MessageFlags.Ephemeral });
					return;
				}

				readied.add(j.user.id);
				await j.deferUpdate();

				const p1Ready = readied.has(state.players[0].discordId);
				const p2Ready = readied.has(state.players[1].discordId);

				if (p1Ready && p2Ready) {
					readyCol.stop();
					await resumeMsg.edit({
						components: [getCountdownContainer(chart, coverUrl)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
				else {
					const unready = !p1Ready ? p1DiscordUser : p2DiscordUser;
					await resumeMsg.edit({
						components: [getReadyCheckContainer(chart, p1DiscordUser, p2DiscordUser, p1Ready, p2Ready, false, unready, coverUrl)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			});
		}
		else {
			const pickerStatePlayer = state.players.find(p => p.discordId === state.currentPickerDiscordId);
			const pickerDiscordUser = discordUsersMap.get(state.currentPickerDiscordId) ?? { username: pickerStatePlayer?.displayName ?? "?" };

			resumeMsg = await channel.send({
				components: [getPickContainer(pickerDiscordUser, currentPool, getScore(state), getPlayerNames(state), state.meta.bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});

			const updatedFakeInteraction = makeFakeInteraction(resumeMsg, channel);
			matchStateRef.interaction = updatedFakeInteraction;
			state.interaction = updatedFakeInteraction;
			await saveMatchState();

			startPickPhase(updatedFakeInteraction, resumeMsg, state, discordUsersMap);
		}

		console.log(`[resume] Match resumed in #${channel.name ?? doc.meta.channelId}`);
		return true;
	}
	catch (err) {
		console.error('[resume] Auto-resume failed with error:', err);
		return false;
	}
}

function makeFakeInteraction(message, channel) {
	return {
		editReply: (options) => message?.edit(options),
		fetchReply: () => Promise.resolve(message),
		followUp: (options) => channel.send(options),
		guild: channel.guild,
		channel,
	};
}

module.exports = { resumeMatch };
