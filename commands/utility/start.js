const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { players, initMatchState, saveMatchState, getMatchState } = require('../../state/match.js');
const MatchModel = require('../../models/Match.js');
const { getMatchPool, getGeneratedPools } = require('../../state/generatedPools.js');
const { ROUNDS, getRound } = require('../../state/rounds.js');
const { getActiveEvent } = require('../../state/event.js');
const {
	getCheckInContainer,
	getRefApprovalContainer,
	getBanOrderContainer,
	getBanContainer,
	getPickContainer,
	getSimpleContainer,
} = require('../../ui/matchContainers.js');
const { startPickPhase } = require('../../util/matchFlow.js');
const { broadcastMatchState } = require('../../util/broadcastMatch.js');
const { requireReferee } = require('../../util/requireReferee.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('start')
		.setDescription('Start the next match!')
		.addStringOption((o) =>
			o.setName('round')
				.setDescription('The round being played')
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addStringOption((o) =>
			o.setName('match')
				.setDescription('Match number within this round')
				.setRequired(true)
				.setAutocomplete(true),
		),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		const event = getActiveEvent();

		if (focused.name === 'round') {
			const filtered = ROUNDS
				.filter((r) => r.name.toLowerCase().includes(focused.value.toLowerCase()))
				.slice(0, 25)
				.map((r) => ({ name: `${r.name} — Bo${r.bestOf} T${r.tier}`, value: r.name }));
			await interaction.respond(filtered);
			return;
		}

		if (focused.name === 'match') {
			const roundName = interaction.options.getString('round');
			const round = getRound(roundName);
			if (!round || !event) {
				await interaction.respond([]);
				return;
			}

			const pools = getGeneratedPools();
			const bracket = pools?.find((b) => b.name === round.bracket);
			const roundData = bracket?.rounds.find((r) => r.name === round.round);
			if (!roundData) {
				await interaction.respond([]);
				return;
			}

			const completedMatches = await MatchModel.find({
				event: event._id,
				round: roundName,
				status: { $in: ['completed', 'restarted'] },
			}).select('matchNumber');
			const completedNumbers = new Set(completedMatches.map((m) => m.matchNumber));

			const options = roundData.matches
				.map((_, i) => i + 1)
				.filter((n) => !completedNumbers.has(n))
				.filter((n) => String(n).includes(focused.value))
				.slice(0, 25)
				.map((n) => ({ name: `Match ${n}`, value: String(n) }));

			await interaction.respond(options);
			return;
		}

		await interaction.respond([]);
	},

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const event = getActiveEvent();
		if (!event) {
			await interaction.reply({ content: '❌ No active event! Use `/event create` or `/event switch` first.', flags: MessageFlags.Ephemeral });
			return;
		}

		const roundName = interaction.options.getString('round');
		const matchNumber = parseInt(interaction.options.getString('match'));
		const round = getRound(roundName);

		if (!round) {
			await interaction.reply({ content: '❌ Unknown round. Please select one from the autocomplete list.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (isNaN(matchNumber) || matchNumber < 1) {
			await interaction.reply({ content: '❌ Invalid match number.', flags: MessageFlags.Ephemeral });
			return;
		}

		let mapPoolRaw;
		try {
			mapPoolRaw = getMatchPool(round.bracket, round.round, matchNumber - 1);
		}
		catch (err) {
			await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
			return;
		}
		const mapPool = mapPoolRaw.map((c) => c.name);

		const existing = await MatchModel.findOne({ event: event._id, round: roundName, matchNumber, status: 'completed' });
		if (existing) {
			await interaction.reply({ content: `❌ **${roundName}** match #${matchNumber} has already been completed. Check the match history if you need to review the result.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (getMatchState()) {
			await interaction.reply({ content: '❌ A match is already in progress! Use `/result` to submit chart results or wait for it to finish.', flags: MessageFlags.Ephemeral });
			return;
		}

		const { bestOf, tier } = round;
		let player1 = null;
		let player2 = null;

		const response = await interaction.reply({
			components: [getCheckInContainer(players)],
			flags: MessageFlags.IsComponentsV2,
			withResponse: true,
		});

		const checkInCol = response.resource.message.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
		});

		checkInCol.on('collect', async (i) => {
			const selection = i.values[0];
			const index = players.indexOf(selection);

			if (process.env.NODE_ENV !== 'development' && (player1 === i.user || player2 === i.user)) {
				await i.reply({
					content: `You have already checked in as **${player1 === i.user ? players[0] : players[1]}**.`,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			if (index === 0 && player1 === null) {
				player1 = i.user;
				await i.reply({ content: `You have checked in as **${selection}**. Please wait for referee approval.`, flags: MessageFlags.Ephemeral });
			}
			else if (index === 1 && player2 === null) {
				player2 = i.user;
				await i.reply({ content: `You have checked in as **${selection}**. Please wait for referee approval.`, flags: MessageFlags.Ephemeral });
			}
			else {
				await i.reply({ content: `**${selection}** has already been selected.`, flags: MessageFlags.Ephemeral });
				return;
			}

			if (player1 === null || player2 === null) return;
			checkInCol.stop();

			const refApproval = await interaction.followUp({
				components: [getRefApprovalContainer(player1, player2, players)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				withResponse: true,
			});

			const refApprovalConf = await refApproval.awaitMessageComponent({
				filter: (k) => k.user.id === interaction.user.id,
			});

			if (refApprovalConf.customId === 'reject') {
				await refApprovalConf.update({
					components: [getSimpleContainer('❌ Rejected! Check in terminated.')],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
				await interaction.editReply({
					components: [getSimpleContainer('Check in terminated.')],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			await refApprovalConf.update({
				components: [getSimpleContainer('✅ Approved! Starting ban phase...')],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});

			const randomPlayer = Math.random() >= 0.5 ? player1 : player2;
			const otherPlayer = randomPlayer !== player1 ? player1 : player2;

			const banOrderMsg = await interaction.editReply({
				components: [getBanOrderContainer(randomPlayer)],
				flags: MessageFlags.IsComponentsV2,
				withResponse: true,
			});

			const banOrderCol = banOrderMsg.createMessageComponentCollector({
				filter: (j) => j.user.id === randomPlayer.id,
				componentType: ComponentType.Button,
				max: 1,
			});

			banOrderCol.on('collect', async (j) => {
				await j.deferUpdate();

				const firstBanner = j.customId === 'first' ? randomPlayer : otherPlayer;
				const secondBanner = firstBanner === randomPlayer ? otherPlayer : randomPlayer;
				const numBans = mapPool.length - 1;
				// eslint-disable-next-line no-shadow
				const banOrder = Array.from({ length: numBans }, (_, i) => (i % 2 === 0 ? firstBanner : secondBanner));
				let currentMapPool = [...mapPool];
				let banTurn = 0;

				const state = await initMatchState(player1, player2, firstBanner, bestOf, tier, currentMapPool, interaction, roundName, matchNumber);
				await broadcastMatchState('match.start', state);

				await interaction.editReply({
					components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
					flags: MessageFlags.IsComponentsV2,
				});

				const banMessage = await interaction.fetchReply();

				const banSelectCol = banMessage.createMessageComponentCollector({
					componentType: ComponentType.StringSelect,
					filter: (k) => k.customId === 'mapBan',
				});

				banSelectCol.on('collect', async (k) => {
					if (k.user.id !== banOrder[banTurn].id) {
						await k.reply({ content: 'It\'s not your turn to ban!', flags: MessageFlags.Ephemeral });
						return;
					}

					await k.deferUpdate();
					currentMapPool = currentMapPool.filter((m) => m !== k.values[0]);
					banTurn++;

					if (currentMapPool.length <= 1) {
						banSelectCol.stop();
						state.currentMapPool = [...currentMapPool];
						await saveMatchState();
						await broadcastMatchState('match.pickPhaseStart', state);

						await interaction.editReply({
							components: [getPickContainer(firstBanner, currentMapPool, state.score, state.playerNames, bestOf)],
							flags: MessageFlags.IsComponentsV2,
						});

						const pickMessage = await interaction.fetchReply();
						startPickPhase(interaction, pickMessage, state);
						return;
					}

					await interaction.editReply({
						components: [getBanContainer(banOrder[banTurn], currentMapPool, state.score, state.playerNames, bestOf)],
						flags: MessageFlags.IsComponentsV2,
					});
				});
			});
		});
	},
};
