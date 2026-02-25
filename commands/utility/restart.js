const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { getMatchState } = require('../../state/match.js');
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

const players = ['Player 1', 'Player 2'];

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

		const completed = await MatchModel.find({ 'meta.eventId': event._id, status: 'completed' })
			.sort({ 'meta.completedAt': -1 })
			.limit(50);

		const filtered = completed
			.filter((m) => {
				const p1 = m.players?.[0]?.displayName ?? 'P1';
				const p2 = m.players?.[1]?.displayName ?? 'P2';
				const label = `${m.meta?.round} #${m.meta?.matchNumber} — ${p1} vs ${p2}`;
				return label.toLowerCase().includes(focused);
			})
			.slice(0, 25)
			.map((m) => {
				const p1 = m.players?.[0]?.displayName ?? 'P1';
				const p2 = m.players?.[1]?.displayName ?? 'P2';
				return {
					name: `${m.meta?.round} — Match #${m.meta?.matchNumber} (${p1} vs ${p2})`,
					value: m._id.toString(),
				};
			});

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
		const oldMatch = await MatchModel.findOne({ _id: matchId, 'meta.eventId': event._id, status: 'completed' });

		if (!oldMatch) {
			await interaction.reply({ content: '❌ Match not found or not yet completed.', flags: MessageFlags.Ephemeral });
			return;
		}

		const round = getRound(oldMatch.meta.round);
		if (!round) {
			await interaction.reply({ content: `❌ Could not find round config for "${oldMatch.meta.round}".`, flags: MessageFlags.Ephemeral });
			return;
		}

		await MatchModel.findByIdAndUpdate(matchId, { status: 'restarted' });

		const { bestOf, tier } = round;
		const mapPool = oldMatch.mappool.map(c => ({ csvName: c.csvName, songId: c.songId }));
		const roundName = oldMatch.meta.round;
		const matchNumber = oldMatch.meta.matchNumber;
		const player1Name = oldMatch.players?.[0]?.displayName ?? players[0];
		const player2Name = oldMatch.players?.[1]?.displayName ?? players[1];

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
				player1Name,
				player2Name,
				mapPool,
				bestOf,
				tier,
				roundName,
				matchNumber,
			}, discordUsersMap);
		});
	},
};
