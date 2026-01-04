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

function getMapPoolContainer(nextPlayer) {
	let mapPoolStr = '**Map Pool:**';
	const mapPoolOptions = [];

	for (const map of mapPool) {
		mapPoolStr += '\n- ' + map;
		mapPoolOptions.push(new StringSelectMenuOptionBuilder().setLabel(map).setValue(map));
	}

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(mapPoolStr),
		)
		.addSeparatorComponents((separator) => separator)
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

function getRoundResultsContainer() {
	let mapPoolStr = '**Map Pool:**';
	const mapPoolOptions = [];

	for (const map of mapPool) {
		mapPoolStr += '\n- ' + map;
		mapPoolOptions.push(new StringSelectMenuOptionBuilder().setLabel(map).setValue(map));
	}

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(mapPoolStr),
		)
		.addSeparatorComponents((separator) => separator)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`**${interaction.user}**, it is your turn to select a map!`),
		)
		.addActionRowComponents((actionRow) =>
			actionRow.setComponents(new StringSelectMenuBuilder()
				.setCustomId('mapSelect')
				.setPlaceholder('Select a map to play...')
				.addOptions(mapPoolOptions),
			),
		);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('start')
		.setDescription('Start the next match!'),
	async execute(interaction) {
		const response = await interaction.reply({
			components: [getCheckInContainer(interaction)],
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

			if (player1 === i.user || player2 === i.user) {
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
				const refApproval = await interaction.followUp({
					components: [getRefApprovalContainer()],
					flags: [
						MessageFlags.IsComponentsV2,
						MessageFlags.Ephemeral,
					],
					withResponse: true,
				});

				const refApprovalConf = await refApproval.awaitMessageComponent();

				if (refApprovalConf.customId === 'approve') {
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
					});

					banCol.on('collect', async (j) => {
						console.log(j);
						const firstPlayer = j.values[0] === 'first' ? randomPlayer : otherPlayer;

						await interaction.followUp({
							components: [getMapPoolContainer(firstPlayer)],
							flags: [
								MessageFlags.IsComponentsV2,
								MessageFlags.Ephemeral,
							],
							withResponse: true,
						});
					});
				}
				else if (refApprovalConf.customId === 'reject') {
					await interaction.editReply({
						components: [
							new ContainerBuilder()
								.setAccentColor(accentColor)
								.addTextDisplayComponents((textDisplay) =>
									textDisplay.setContent('Check in terminated.'),
								),
						],
						flags: [
							MessageFlags.IsComponentsV2,
						],
					});
				}
			}

		});

		// const collector = response.resource.message.createMessageComponentCollector({
		// 	componentType: ComponentType.StringSelect,
		// 	time: 3600000,
		// });

		// collector.on('collect', async (i) => {
		// 	const selection = i.values[0];
		// 	const resultContainer = new ContainerBuilder()
		// 		.setAccentColor(accentColor)
		// 		.addTextDisplayComponents((textDisplay) =>
		// 			textDisplay.setContent(`**${i.user.username}** has selected **${selection}**!`),
		// 		)
		// 		.addTextDisplayComponents((textDisplay) =>
		// 			textDisplay.setContent(`**${i.user}**, please click the button below when you are ready.`),
		// 		)
		// 		.addActionRowComponents((actionRow) =>
		// 			actionRow.setComponents(new ButtonBuilder()
		// 				.setCustomId('ready')
		// 				.setLabel('Ready')
		// 				.setStyle(ButtonStyle.Success),
		// 			),
		// 		);

		// 	await interaction.editReply({
		// 		components: [resultContainer],
		// 		flags: MessageFlags.IsComponentsV2,
		// 		withResponse: true,
		// 	});
		// });
	},
};