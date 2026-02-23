const { MessageFlags, ComponentType } = require('discord.js');
const { getMatchPool } = require('../state/generatedPools.js');
const { getRound } = require('../state/rounds.js');
const {
	getPickContainer,
	getReadyCheckContainer,
	getCountdownContainer,
	getSimpleContainer,
} = require('../ui/matchContainers.js');
const { startPickPhase } = require('./matchFlow.js');
const { saveMatchState } = require('../state/match.js');

async function resumeMatch(client, doc, matchStateRef) {
	try {
		let channel;
		try {
			channel = await client.channels.fetch(doc.channelId);
		}
		catch {
			console.error(`[resume] Could not fetch channel ${doc.channelId}`);
			return false;
		}

		const player1 = await client.users.fetch(doc.player1DiscordId);
		const player2 = await client.users.fetch(doc.player2DiscordId);
		const currentPicker = await client.users.fetch(doc.currentPickerDiscordId);

		const round = getRound(doc.round);
		if (!round) {
			console.error(`[resume] Unknown round "${doc.round}"`);
			return false;
		}

		const fullMapPool = getMatchPool(round.bracket, round.round, doc.matchNumber - 1);

		if (!fullMapPool || fullMapPool.length === 0) {
			console.error('[resume] Full map pool is empty — pools may not have been generated yet.');
			await channel.send({
				components: [getSimpleContainer('⚠️ Could not auto-resume: map pool is missing. Please run `/generate` and then `/start` again.')],
				flags: MessageFlags.IsComponentsV2,
			});
			return false;
		}

		const playedNames = new Set(doc.playedCharts.map((c) => (typeof c === 'string' ? c : c.name)));
		const currentMapPool = fullMapPool.filter((m) => !playedNames.has(m.name));

		if (currentMapPool.length === 0) {
			console.error('[resume] Current map pool resolved to 0 maps — match may already be complete.');
			return false;
		}

		Object.assign(matchStateRef, {
			_id: doc._id,
			player1,
			player2,
			playerNames: [doc.player1, doc.player2],
			fullMapPool,
			playedCharts: doc.playedCharts,
			currentMapPool,
			score: doc.score,
			bestOf: doc.bestOf,
			tier: doc.tier,
			winsNeeded: Math.ceil(doc.bestOf / 2),
			currentPicker,
			currentChart: doc.currentChart,
		});

		let resumeMsg;

		if (doc.currentChart) {
			let p1Ready = false;
			let p2Ready = false;

			resumeMsg = await channel.send({
				components: [getReadyCheckContainer(doc.currentChart, player1, player2, p1Ready, p2Ready, true)],
				flags: MessageFlags.IsComponentsV2,
			});

			const fakeInteraction = makeFakeInteraction(resumeMsg, channel);
			matchStateRef.interaction = fakeInteraction;

			const readyCol = resumeMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				filter: (j) => j.user.id === player1.id || j.user.id === player2.id,
			});

			readyCol.on('collect', async (j) => {
				if (j.user.id === player1.id && !p1Ready) { p1Ready = true; }
				else if (j.user.id === player2.id && !p2Ready) { p2Ready = true; }
				else {
					await j.reply({ content: 'You\'re already ready!', flags: MessageFlags.Ephemeral });
					return;
				}

				await j.deferUpdate();

				if (p1Ready && p2Ready) {
					readyCol.stop();
					await resumeMsg.edit({
						components: [getCountdownContainer(doc.currentChart)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
				else {
					const unready = !p1Ready ? player1 : player2;
					await resumeMsg.edit({
						components: [getReadyCheckContainer(doc.currentChart, player1, player2, p1Ready, p2Ready, false, unready)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			});
		}
		else {
			resumeMsg = await channel.send({
				components: [getPickContainer(currentPicker, currentMapPool, doc.score, [doc.player1, doc.player2], doc.bestOf)],
				flags: MessageFlags.IsComponentsV2,
			});

			const fakeInteraction = makeFakeInteraction(resumeMsg, channel);
			matchStateRef.interaction = fakeInteraction;
			await saveMatchState();

			startPickPhase(fakeInteraction, resumeMsg, matchStateRef);
		}

		console.log(`[resume] Match resumed in #${channel.name ?? doc.channelId}`);
		return true;
	}
	catch (err) {
		console.error('[resume] Auto-resume failed with error:', err);
		return false;
	}
}

function makeFakeInteraction(message, channel) {
	return {
		editReply: (options) => message.edit(options),
		fetchReply: () => Promise.resolve(message),
		followUp: (options) => channel.send(options),
		guild: channel.guild,
		channel,
	};
}

module.exports = { resumeMatch };
