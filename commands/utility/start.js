const { ContainerBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');

const accentColor = 0x40ffa0;
const mapPool = [
	'Chromatically - smb',
	'The Code - TreXDer & LuminaryCat',
	'Won\'t Let You Go - Dacey',
	'Down With Your Love - Steven of Astora',
	'Spring Thief - Stride',
];

const players = ['Player 1', 'Player 2'];
let player1 = null;
let player2 = null;

function getCheckInContainer() {
	const playerOptions = [];
	for (const player of players) {
		playerOptions.push(new StringSelectMenuOptionBuilder().setLabel(player).setValue(player));
	}

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent('## SpeenOpen Qualifiers - Pool AA1 - Match A'),
		)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent('Players, please check in using the dropdown below.'),
		)
		.addActionRowComponents((actionRow) =>
			actionRow.setComponents(new StringSelectMenuBuilder()
				.setCustomId('playerCheckIn')
				.setPlaceholder('Select your start.gg username')
				.addOptions(playerOptions),
			),
		);
}

function getRefApprovalContainer() {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`**${player1.username}** has checked in as **${players[0]}**.\n**${player2.username}** has checked in as **${players[1]}**.`),
		)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent('If this looks correct, please press the **Approve** button below.\nOtherwise, press the **Reject** button to terminate the check in process.'),
		)
		.addActionRowComponents((actionRow) =>
			actionRow.setComponents(
				new ButtonBuilder()
					.setCustomId('approve')
					.setLabel('Approve')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('reject')
					.setLabel('Reject')
					.setStyle(ButtonStyle.Danger),
			),
		);
}

function getBanContainer(randomPlayer) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`**${randomPlayer.username}** has been randomly chosen!`),
		)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`**${randomPlayer}**, would you like to ban first or second?`),
		)
		.addActionRowComponents((actionRow) =>
			actionRow.setComponents(
				new ButtonBuilder()
					.setCustomId('first')
					.setLabel('First')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('second')
					.setLabel('Second')
					.setStyle(ButtonStyle.Primary),
			),
		);
}

function getMapPoolContainer(nextPlayer, currentMapPool) {
	let mapPoolStr = '**Map Pool:**';
	const mapPoolOptions = [];

	for (const map of currentMapPool) {
		mapPoolStr += '\n- ' + map;
		mapPoolOptions.push(new StringSelectMenuOptionBuilder().setLabel(map).setValue(map));
	}

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(mapPoolStr),
		)
		.addSeparatorComponents((separator) => separator);

	if (nextPlayer === null) {
		container.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`The map to be played is **${currentMapPool[0]}**!`),
		);
	}
	else {
		container
			.addTextDisplayComponents((textDisplay) =>
				textDisplay.setContent(`**${nextPlayer}**, it is your turn to ban!`),
			)
			.addActionRowComponents((actionRow) =>
				actionRow.setComponents(new StringSelectMenuBuilder()
					.setCustomId('mapSelect')
					.setPlaceholder('Select a map to ban...')
					.addOptions(mapPoolOptions),
				),
			);
	}

	return container;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('start')
		.setDescription('Start the next match!'),
	async execute(interaction) {
		const response = await interaction.reply({
			components: [getCheckInContainer()],
			flags: MessageFlags.IsComponentsV2,
			withResponse: true,
		});

		const checkInCol = response.resource.message.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
		});

		checkInCol.on('collect', async (i) => {
			const selection = i.values[0];
			const index = players.indexOf(selection);

			async function success() {
				await i.reply({
					content: `You have checked in as **${selection}**. Please wait for referee approval.`,
					flags: MessageFlags.Ephemeral,
				});
			}

			if (process.env.NODE_ENV !== 'development' && (player1 === i.user || player2 === i.user)) {
				await i.reply({
					content: `You have already checked in as **${player1 === i.user ? players[0] : players[1]}**.`,
					flags: MessageFlags.Ephemeral,
				});
			}
			else if (index === 0 && player1 === null) {
				player1 = i.user;
				success();
			}
			else if (index === 1 && player2 === null) {
				player2 = i.user;
				success();
			}
			else {
				await i.reply({
					content: `**${selection}** has already been selected.`,
					flags: MessageFlags.Ephemeral,
				});
			}

			if (player1 !== null && player2 !== null) {
				checkInCol.stop();

				const refApproval = await interaction.followUp({
					components: [getRefApprovalContainer()],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
					withResponse: true,
				});

				const refApprovalConf = await refApproval.awaitMessageComponent({
					filter: (k) => k.user.id === interaction.user.id,
				});

				if (refApprovalConf.customId === 'approve') {
					await refApprovalConf.deferUpdate();

					const randomPlayer = Math.random() >= 0.5 ? player1 : player2;
					const otherPlayer = randomPlayer !== player1 ? player1 : player2;

					const ban = await interaction.editReply({
						components: [getBanContainer(randomPlayer)],
						flags: [MessageFlags.IsComponentsV2],
						withResponse: true,
					});

					const banFilter = (j) => j.user.id === randomPlayer.id;

					const banCol = ban.createMessageComponentCollector({
						filter: banFilter,
						componentType: ComponentType.Button,
						max: 1,
					});

					banCol.on('collect', async (j) => {
						await j.deferUpdate();
						const firstPlayer = j.customId === 'first' ? randomPlayer : otherPlayer;
						const secondPlayer = firstPlayer === randomPlayer ? otherPlayer : randomPlayer;
						let currentMapPool = [...mapPool];
						let banTurn = 0;
						const banOrder = [firstPlayer, secondPlayer, firstPlayer, secondPlayer];

						await interaction.editReply({
							components: [getMapPoolContainer(banOrder[banTurn], currentMapPool)],
							flags: MessageFlags.IsComponentsV2,
						});

						const banMessage = await interaction.fetchReply();

						const banSelectCol = banMessage.createMessageComponentCollector({
							filter: (k) => k.user.id === banOrder[banTurn].id,
							componentType: ComponentType.StringSelect,
						});

						banSelectCol.on('collect', async (k) => {
							await k.deferUpdate();
							const banned = k.values[0];
							currentMapPool = currentMapPool.filter((m) => m !== banned);
							banTurn++;

							if (currentMapPool.length <= 1) {
								banSelectCol.stop();
								await interaction.editReply({
									components: [getMapPoolContainer(null, currentMapPool)],
									flags: MessageFlags.IsComponentsV2,
								});
								return;
							}

							await interaction.editReply({
								components: [getMapPoolContainer(banOrder[banTurn], currentMapPool)],
								flags: MessageFlags.IsComponentsV2,
							});
						});
					});
				}
				else if (refApprovalConf.customId === 'reject') {
					await refApprovalConf.deferUpdate();

					await interaction.editReply({
						components: [
							new ContainerBuilder()
								.setAccentColor(accentColor)
								.addTextDisplayComponents((textDisplay) =>
									textDisplay.setContent('Check in terminated.'),
								),
						],
						flags: [MessageFlags.IsComponentsV2],
					});
				}
			}
		});
	},
};