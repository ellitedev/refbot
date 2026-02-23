const { ContainerBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');

const accentColor = 0x40ffa0;

function chartName(entry) {
	return typeof entry === 'string' ? entry : entry.name;
}

function getCheckInContainer(players) {
	const playerOptions = players.map((p) =>
		new StringSelectMenuOptionBuilder().setLabel(p).setValue(p),
	);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent('## SpeenOpen Qualifiers - Pool AA1 - Match A'))
		.addTextDisplayComponents((t) => t.setContent('Players, please check in using the dropdown below.'))
		.addActionRowComponents((row) =>
			row.setComponents(
				new StringSelectMenuBuilder()
					.setCustomId('playerCheckIn')
					.setPlaceholder('Select your start.gg username')
					.addOptions(playerOptions),
			),
		);
}

function getRefApprovalContainer(p1, p2, playerNames) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`**${p1.username}** has checked in as **${playerNames[0]}**.\n**${p2.username}** has checked in as **${playerNames[1]}**.`),
		)
		.addTextDisplayComponents((t) =>
			t.setContent('If this looks correct, please press the **Approve** button below.\nOtherwise, press the **Reject** button to terminate the check in process.'),
		)
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('approve').setLabel('Approve').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('reject').setLabel('Reject').setStyle(ButtonStyle.Danger),
			),
		);
}

function getBanOrderContainer(randomPlayer) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(`**${randomPlayer.username}** has been randomly chosen!`))
		.addTextDisplayComponents((t) => t.setContent(`**${randomPlayer.username}**, would you like to ban first or second?`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('first').setLabel('First').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId('second').setLabel('Second').setStyle(ButtonStyle.Primary),
			),
		);
}

function getBanContainer(nextBanner, currentMapPool, score, playerNames, bestOf) {
	const scoreStr = `**${playerNames[0]}** ${score[0]} - ${score[1]} **${playerNames[1]}** *(Best of ${bestOf})*`;
	let mapPoolStr = '**Map Pool:**';
	for (const map of currentMapPool) mapPoolStr += `\n- ${chartName(map)}`;

	const mapPoolOptions = currentMapPool.map((m) =>
		new StringSelectMenuOptionBuilder().setLabel(chartName(m)).setValue(chartName(m)),
	);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(scoreStr))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(mapPoolStr))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(`**${nextBanner.username}**, it is your turn to ban!`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new StringSelectMenuBuilder()
					.setCustomId('mapBan')
					.setPlaceholder('Select a map to ban...')
					.addOptions(mapPoolOptions),
			),
		);
}

function getPickContainer(nextPicker, currentMapPool, score, playerNames, bestOf) {
	const scoreStr = `**${playerNames[0]}** ${score[0]} - ${score[1]} **${playerNames[1]}** *(Best of ${bestOf})*`;
	let mapPoolStr = '**Map Pool:**';
	for (const map of currentMapPool) mapPoolStr += `\n- ${chartName(map)}`;

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(scoreStr))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(mapPoolStr))
		.addSeparatorComponents((s) => s);

	if (currentMapPool.length === 1) {
		container.addTextDisplayComponents((t) =>
			t.setContent(`The map to be played is **${chartName(currentMapPool[0])}**!`),
		);
	}
	else {
		const mapPoolOptions = currentMapPool.map((m) =>
			new StringSelectMenuOptionBuilder().setLabel(chartName(m)).setValue(chartName(m)),
		);
		container
			.addTextDisplayComponents((t) => t.setContent(`**${nextPicker.username}**, it is your turn to pick!`))
			.addActionRowComponents((row) =>
				row.setComponents(
					new StringSelectMenuBuilder()
						.setCustomId('mapSelect')
						.setPlaceholder('Select a map to play...')
						.addOptions(mapPoolOptions),
				),
			);
	}

	return container;
}

function getReadyCheckContainer(chart, p1, p2, p1Ready, p2Ready, initialPing = false, unreadyPlayer = null, coverUrl = null) {
	const p1Status = p1Ready ? '✅' : '⬜';
	const p2Status = p2Ready ? '✅' : '⬜';

	let pingLine = '';
	if (initialPing) pingLine = `<@${p1.id}> <@${p2.id}>\n`;
	else if (unreadyPlayer) pingLine = `<@${unreadyPlayer.id}>\n`;

	const container = new ContainerBuilder()
		.setAccentColor(accentColor);

	if (coverUrl) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(
				new MediaGalleryItemBuilder().setURL(coverUrl),
			),
		);
	}

	container
		.addTextDisplayComponents((t) => t.setContent(`${pingLine}**${chartName(chart)}** will be played!`))
		.addTextDisplayComponents((t) => t.setContent(`${p1Status} ${p1.username}\n${p2Status} ${p2.username}`))
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('ready').setLabel('Ready!').setStyle(ButtonStyle.Success),
			),
		);

	return container;
}

function getCountdownContainer(chart, coverUrl = null) {
	const container = new ContainerBuilder()
		.setAccentColor(accentColor);

	if (coverUrl) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(
				new MediaGalleryItemBuilder().setURL(coverUrl),
			),
		);
	}

	container
		.addTextDisplayComponents((t) => t.setContent(`**${chartName(chart)}** will be played!`))
		.addTextDisplayComponents((t) => t.setContent('Both players ready! Starting countdown...'));

	return container;
}

function getWinnerContainer(winner, score, playerNames, bestOf) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(`## 🏆 ${winner.username} wins the match!`))
		.addTextDisplayComponents((t) =>
			t.setContent(`**Final Score:** ${playerNames[0]} ${score[0]} - ${score[1]} ${playerNames[1]} *(Best of ${bestOf})*`),
		);
}

function getSimpleContainer(message) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(message));
}

module.exports = {
	getCheckInContainer,
	getRefApprovalContainer,
	getBanOrderContainer,
	getBanContainer,
	getPickContainer,
	getReadyCheckContainer,
	getCountdownContainer,
	getWinnerContainer,
	getSimpleContainer,
};
