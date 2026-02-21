const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { players, initMatchState } = require('../../state/match.js');
const { getMatchPool } = require('../../state/generatedPools.js');
const { ROUNDS, getRound } = require('../../state/rounds.js');
const {
	getCheckInContainer,
	getRefApprovalContainer,
	getBanOrderContainer,
	getBanContainer,
	getPickContainer,
	getSimpleContainer,
} = require('../../ui/matchContainers.js');
const { startPickPhase } = require('../../util/matchFlow.js');

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
		.addIntegerOption((o) =>
			o.setName('match')
				.setDescription('Match number within this round (1-indexed)')
				.setRequired(true)
				.setMinValue(1),
		),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused().toLowerCase();
		const filtered = ROUNDS
			.filter((r) => r.name.toLowerCase().includes(focused))
			.slice(0, 25)
			.map((r) => ({ name: `${r.name} — Bo${r.bestOf} T${r.tier}`, value: r.name }));
		await interaction.respond(filtered);
	},

	async execute(interaction) {
		const roundName = interaction.options.getString('round');
		const matchNumber = interaction.options.getInteger('match');
		const round = getRound(roundName);

		if (!round) {
			await interaction.reply({ content: '❌ Unknown round. Please select one from the autocomplete list.', flags: MessageFlags.Ephemeral });
			return;
		}

		let mapPool;
		try {
			mapPool = getMatchPool(round.bracket, round.round, matchNumber - 1);
		}
		catch (err) {
			await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
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
				const banOrder = Array.from({ length: numBans }, (_, i) => (i % 2 === 0 ? firstBanner : secondBanner));
				let currentMapPool = [...mapPool];
				let banTurn = 0;

				const state = initMatchState(player1, player2, firstBanner, bestOf, tier, currentMapPool, interaction);

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
