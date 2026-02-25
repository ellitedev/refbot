const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { getMatchState } = require('../../state/match.js');
const MatchModel = require('../../models/Match.js');
const { getMatchPool, getGeneratedPools } = require('../../state/generatedPools.js');
const { ROUNDS, getRound } = require('../../state/rounds.js');
const { getActiveEvent } = require('../../state/event.js');
const {
	getCheckInContainer,
	getRefApprovalContainer,
	getSimpleContainer,
} = require('../../ui/matchContainers.js');
const { startBanPhase } = require('../../util/matchFlow.js');
const { requireReferee } = require('../../util/requireReferee.js');
const { broadcast } = require('../../state/ws.js');

const players = ['Player 1', 'Player 2'];

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

			if (!roundData || !roundData.matches) {
				await interaction.respond([]);
				return;
			}

			const completedMatches = await MatchModel.find({
				'meta.eventId': event._id,
				'meta.round': roundName,
				status: { $in: ['completed', 'restarted'] },
			}).select('meta.matchNumber');

			const completedNumbers = new Set(completedMatches.map((m) => m.meta.matchNumber));

			const options = roundData.matches
				.map((_, i) => i + 1)
				.filter((n) => !completedNumbers.has(n))
				.filter((n) => String(n).includes(focused.value))
				.slice(0, 25)
				.map((n) => ({ name: `Match ${n}`, value: String(n) }));

			await interaction.respond(options);
			return;
		}
	},

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const event = getActiveEvent();
		if (!event) {
			await interaction.reply({ content: '❌ No active event! Use `/event create` or `/event switch` first.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (getMatchState()) {
			await interaction.reply({ content: '❌ A match is already in progress!', flags: MessageFlags.Ephemeral });
			return;
		}

		const roundName = interaction.options.getString('round');
		const matchNumberStr = interaction.options.getString('match');

		if (!matchNumberStr || isNaN(parseInt(matchNumberStr, 10))) {
			await interaction.reply({ content: '❌ Invalid match number provided.', flags: MessageFlags.Ephemeral });
			return;
		}

		const matchNumber = parseInt(matchNumberStr, 10);
		const round = getRound(roundName);

		if (!round) {
			await interaction.reply({ content: `❌ Unknown round "${roundName}".`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (matchNumber < 1) {
			await interaction.reply({ content: '❌ Match number must be at least 1.', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			const mapPool = getMatchPool(round.bracket, round.round, matchNumber - 1);

			if (!mapPool || mapPool.length === 0) {
				await interaction.reply({ content: '❌ No map pool found for this match. Has `/generate` been run?', flags: MessageFlags.Ephemeral });
				return;
			}

			const { bestOf, tier } = round;
			let player1 = null;
			let player2 = null;
			const discordUsersMap = new Map();

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
					broadcast('match.checkIn', { playerNames: players, p1CheckedIn: true, p2CheckedIn: !!player2, round: roundName, matchNumber });
					await i.reply({ content: `You have checked in as **${selection}**. Please wait for referee approval.`, flags: MessageFlags.Ephemeral });
				}
				else if (index === 1 && player2 === null) {
					player2 = i.user;
					broadcast('match.checkIn', { playerNames: players, p1CheckedIn: !!player1, p2CheckedIn: true, round: roundName, matchNumber });
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

				discordUsersMap.set(player1.id, player1);
				discordUsersMap.set(player2.id, player2);

				broadcast('match.approved', { playerNames: players, round: roundName, matchNumber });
				await startBanPhase(interaction, {
					player1,
					player2,
					player1Name: players[0],
					player2Name: players[1],
					mapPool,
					bestOf,
					tier,
					roundName,
					matchNumber,
				}, discordUsersMap);
			});
		}
		catch (error) {
			console.error('Error in start command:', error);
			await interaction.reply({
				content: `❌ Error starting match: ${error.message}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
