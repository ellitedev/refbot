const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { players, getMatchState } = require('../../state/match.js');
const MatchModel = require('../../models/Match.js');
const { getRound } = require('../../state/rounds.js');
const { getActiveEvent } = require('../../state/event.js');
const {
	getCheckInContainer,
	getRefApprovalContainer,
	getSimpleContainer,
} = require('../../ui/matchContainers.js');
const { startBanPhase } = require('../../util/matchFlow.js');
const { requireReferee } = require('../../util/requireReferee.js');
const { broadcast } = require('../../state/ws.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('restart')
		.setDescription('Restart a previously completed match.')
		.addStringOption((o) =>
			o.setName('match')
				.setDescription('The match to restart')
				.setRequired(true)
				.setAutocomplete(true),
		),

	async autocomplete(interaction) {
		const event = getActiveEvent();
		if (!event) return interaction.respond([]);

		const focused = interaction.options.getFocused().toLowerCase();

		const completed = await MatchModel.find({ event: event._id, status: 'completed' })
			.sort({ completedAt: -1 })
			.limit(50);

		const filtered = completed
			.filter((m) => {
				const label = `${m.round} #${m.matchNumber} — ${m.player1} vs ${m.player2}`;
				return label.toLowerCase().includes(focused);
			})
			.slice(0, 25)
			.map((m) => ({
				name: `${m.round} — Match #${m.matchNumber} (${m.player1} vs ${m.player2})`,
				value: m._id.toString(),
			}));

		await interaction.respond(filtered);
	},

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const event = getActiveEvent();
		if (!event) {
			await interaction.reply({ content: '❌ No active event!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (getMatchState()) {
			await interaction.reply({ content: '❌ A match is already in progress!', flags: MessageFlags.Ephemeral });
			return;
		}

		const matchId = interaction.options.getString('match');
		const oldMatch = await MatchModel.findOne({ _id: matchId, event: event._id, status: 'completed' });

		if (!oldMatch) {
			await interaction.reply({ content: '❌ Match not found or not yet completed.', flags: MessageFlags.Ephemeral });
			return;
		}

		const round = getRound(oldMatch.round);
		if (!round) {
			await interaction.reply({ content: `❌ Could not find round config for "${oldMatch.round}".`, flags: MessageFlags.Ephemeral });
			return;
		}

		await MatchModel.findByIdAndUpdate(matchId, { status: 'restarted' });

		const { bestOf, tier } = round;
		const mapPool = [...oldMatch.fullMapPool];
		const roundName = oldMatch.round;
		const matchNumber = oldMatch.matchNumber;
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
				await MatchModel.findByIdAndUpdate(matchId, { status: 'completed' });
				return;
			}

			await refApprovalConf.update({
				components: [getSimpleContainer('✅ Approved! Starting ban phase...')],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});

			broadcast('match.approved', { playerNames: players, round: roundName, matchNumber });
			await startBanPhase(interaction, { player1, player2, mapPool, bestOf, tier, roundName, matchNumber });
		});
	},
};
