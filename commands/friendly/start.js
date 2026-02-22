/* eslint-disable max-statements-per-line */
const {
	SlashCommandBuilder,
	MessageFlags,
	ComponentType,
	ContainerBuilder,
	ButtonBuilder,
	ButtonStyle,
	TextInputBuilder,
	TextInputStyle,
	ModalBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require('discord.js');
const { getFriendlyState, initFriendlyMatch, saveFriendlyState } = require('../../state/friendlyMatch.js');
const { extractSongId, fetchAndCacheChart } = require('../../state/spinshare.js');
const { startFriendlyPickPhase } = require('../../util/friendlyMatchFlow.js');

const accentColor = 0x40ffa0;

function getSetupContainer(p1, p2, bestOf, hasBans, chartCount) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`## Friendly: ${p1} vs ${p2}\n**Best of:** ${bestOf} | **Bans:** ${hasBans ? 'Yes (1 each)' : 'No'}`),
		)
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) =>
			t.setContent(`Please provide **${chartCount}** SpinShare URLs for the map pool.\nPress the button below to open the URL entry form.`),
		)
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('enter_urls').setLabel(`Enter Chart URLs (${chartCount})`).setStyle(ButtonStyle.Primary),
			),
		);
}

function getChartConfirmContainer(charts, p1, p2, bestOf, hasBans) {
	const chartList = charts.map((c, i) => `**${i + 1}.** ${c.title} - ${c.charter}`).join('\n');
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`## Friendly: ${p1} vs ${p2}\n**Best of:** ${bestOf} | **Bans:** ${hasBans ? 'Yes (1 each)' : 'No'}`),
		)
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent(`**Confirmed map pool:**\n${chartList}`))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent('Does this look right?'))
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('confirm_pool').setLabel('Confirm').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('reenter_urls').setLabel('Re-enter URLs').setStyle(ButtonStyle.Secondary),
			),
		);
}

function getCheckInContainer(p1Name, p2Name) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(`## Friendly: ${p1Name} vs ${p2Name}`))
		.addTextDisplayComponents((t) => t.setContent('Players, please check in using the dropdown below.'))
		.addActionRowComponents((row) =>
			row.setComponents(
				new StringSelectMenuBuilder()
					.setCustomId('friendly_checkin')
					.setPlaceholder('Select your name...')
					.addOptions(
						new StringSelectMenuOptionBuilder().setLabel(p1Name).setValue('p1'),
						new StringSelectMenuOptionBuilder().setLabel(p2Name).setValue('p2'),
					),
			),
		);
}

function getRefApprovalContainer(p1User, p2User, p1Name, p2Name) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) =>
			t.setContent(`**${p1User.username}** has checked in as **${p1Name}**.\n**${p2User.username}** has checked in as **${p2Name}**.`),
		)
		.addTextDisplayComponents((t) =>
			t.setContent('If this looks correct, press **Approve**. Otherwise press **Reject** to restart check-in.'),
		)
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('friendly_approve').setLabel('Approve').setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId('friendly_reject').setLabel('Reject').setStyle(ButtonStyle.Danger),
			),
		);
}

function buildModal(batchIndex, batchSize, totalCharts, offset) {
	const modal = new ModalBuilder()
		.setCustomId(`url_modal_${batchIndex}`)
		.setTitle(`Chart URLs (${offset + 1}-${Math.min(offset + batchSize, totalCharts)} of ${totalCharts})`);

	for (let i = 0; i < batchSize; i++) {
		const chartNum = offset + i + 1;
		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId(`url_${i}`)
					.setLabel(`Chart ${chartNum} SpinShare URL`)
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('https://spinsha.re/song/12345')
					.setRequired(true),
			),
		);
	}

	return modal;
}

async function collectUrls(interaction, totalCharts) {
	const BATCH_SIZE = 5;
	const batches = Math.ceil(totalCharts / BATCH_SIZE);
	const allUrls = [];

	for (let batch = 0; batch < batches; batch++) {
		const offset = batch * BATCH_SIZE;
		const thisSize = Math.min(BATCH_SIZE, totalCharts - offset);
		const isFirst = batch === 0;

		if (!isFirst) {
			const continueContainer = new ContainerBuilder()
				.setAccentColor(accentColor)
				.addTextDisplayComponents((t) =>
					t.setContent(`Got charts ${offset} of ${totalCharts}. Press below to continue entering the rest.`),
				)
				.addActionRowComponents((row) =>
					row.setComponents(
						new ButtonBuilder().setCustomId(`continue_batch_${batch}`).setLabel('Continue Entering URLs').setStyle(ButtonStyle.Primary),
					),
				);

			await interaction.editReply({ components: [continueContainer], flags: MessageFlags.IsComponentsV2 });

			const msg = await interaction.fetchReply();
			const btnInteraction = await msg.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) => i.user.id === interaction.user.id && i.customId === `continue_batch_${batch}`,
				time: 300_000,
			});

			await btnInteraction.showModal(buildModal(batch, thisSize, totalCharts, offset));
			const modalSubmit = await btnInteraction.awaitModalSubmit({ filter: (i) => i.user.id === interaction.user.id, time: 300_000 });
			await modalSubmit.deferUpdate();
			for (let i = 0; i < thisSize; i++) allUrls.push(modalSubmit.fields.getTextInputValue(`url_${i}`));
		}
		else {
			const msg = await interaction.fetchReply();
			const btnInteraction = await msg.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) => i.user.id === interaction.user.id && i.customId === 'enter_urls',
				time: 300_000,
			});

			await btnInteraction.showModal(buildModal(batch, thisSize, totalCharts, offset));
			const modalSubmit = await btnInteraction.awaitModalSubmit({ filter: (i) => i.user.id === interaction.user.id, time: 300_000 });
			await modalSubmit.deferUpdate();
			for (let i = 0; i < thisSize; i++) allUrls.push(modalSubmit.fields.getTextInputValue(`url_${i}`));
		}
	}

	return allUrls;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('friendly')
		.setDescription('Manage friendly matches.')
		.addSubcommand((sub) =>
			sub
				.setName('start')
				.setDescription('Start a new friendly match.')
				.addStringOption((o) => o.setName('player1').setDescription('Name of Player 1').setRequired(true))
				.addStringOption((o) => o.setName('player2').setDescription('Name of Player 2').setRequired(true))
				.addIntegerOption((o) =>
					o.setName('best_of')
						.setDescription('Best of how many charts?')
						.setRequired(true)
						.addChoices(
							{ name: 'Bo3', value: 3 },
							{ name: 'Bo5', value: 5 },
							{ name: 'Bo7', value: 7 },
						),
				)
				.addBooleanOption((o) => o.setName('bans').setDescription('Should players ban charts? (1 ban each)').setRequired(true)),
		),

	async execute(interaction) {
		if (!interaction.options.getSubcommand || interaction.options.getSubcommand() !== 'start') return;

		const refUserId = interaction.user.id;

		if (getFriendlyState(refUserId)) {
			await interaction.reply({
				content: '❌ You already have an active friendly match! Use `/friendly-end` to cancel it first.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const p1Name = interaction.options.getString('player1');
		const p2Name = interaction.options.getString('player2');
		const bestOf = interaction.options.getInteger('best_of');
		const hasBans = interaction.options.getBoolean('bans');
		const chartCount = hasBans ? bestOf + 2 : bestOf;

		// --- ephemeral URL setup phase (ref only) ---
		await interaction.reply({
			components: [getSetupContainer(p1Name, p2Name, bestOf, hasBans, chartCount)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			withResponse: true,
		});

		let charts = null;

		while (!charts) {
			let rawUrls;
			try {
				rawUrls = await collectUrls(interaction, chartCount);
			}
			catch {
				await interaction.editReply({
					components: [
						new ContainerBuilder()
							.setAccentColor(accentColor)
							.addTextDisplayComponents((t) => t.setContent('❌ Timed out waiting for URLs. Please run `/friendly start` again.')),
					],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			await interaction.editReply({
				components: [
					new ContainerBuilder()
						.setAccentColor(accentColor)
						.addTextDisplayComponents((t) => t.setContent('Fetching chart data from SpinShare...')),
				],
				flags: MessageFlags.IsComponentsV2,
			});

			const fetched = [];
			const failed = [];
			for (const url of rawUrls) {
				const songId = extractSongId(url);
				if (!songId) { failed.push(url); continue; }
				const chart = await fetchAndCacheChart(songId, null);
				if (!chart) { failed.push(url); continue; }
				fetched.push(chart);
			}

			if (failed.length > 0) {
				const failList = failed.map((u) => `- \`${u}\``).join('\n');
				await interaction.editReply({
					components: [
						new ContainerBuilder()
							.setAccentColor(accentColor)
							.addTextDisplayComponents((t) =>
								t.setContent(`❌ Could not fetch the following URLs:\n${failList}\n\nPlease check them and try again.`),
							)
							.addActionRowComponents((row) =>
								row.setComponents(
									new ButtonBuilder().setCustomId('enter_urls').setLabel('Re-enter Chart URLs').setStyle(ButtonStyle.Primary),
								),
							),
					],
					flags: MessageFlags.IsComponentsV2,
				});
				continue;
			}

			await interaction.editReply({
				components: [getChartConfirmContainer(fetched, p1Name, p2Name, bestOf, hasBans)],
				flags: MessageFlags.IsComponentsV2,
			});

			const confirmMsg = await interaction.fetchReply();
			let confirmInteraction;
			try {
				confirmInteraction = await confirmMsg.awaitMessageComponent({
					componentType: ComponentType.Button,
					filter: (i) => i.user.id === interaction.user.id,
					time: 120_000,
				});
			}
			catch {
				await interaction.editReply({
					components: [
						new ContainerBuilder()
							.setAccentColor(accentColor)
							.addTextDisplayComponents((t) => t.setContent('❌ Timed out. Please run `/friendly start` again.')),
					],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			await confirmInteraction.deferUpdate();

			if (confirmInteraction.customId === 'confirm_pool') {
				charts = fetched;
				const chartList = charts.map((c, i) => `**${i + 1}.** ${c.title} - ${c.charter}`).join('\n');
				await interaction.editReply({
					components: [
						new ContainerBuilder()
							.setAccentColor(accentColor)
							.addTextDisplayComponents((t) =>
								t.setContent(`## Friendly: ${p1Name} vs ${p2Name}\n**Best of:** ${bestOf} | **Bans:** ${hasBans ? 'Yes (1 each)' : 'No'}`),
							)
							.addSeparatorComponents((s) => s)
							.addTextDisplayComponents((t) => t.setContent(`**Confirmed map pool:**\n${chartList}`))
							.addSeparatorComponents((s) => s)
							.addTextDisplayComponents((t) => t.setContent('Map pool confirmed! Starting check-in...')),
					],
					flags: MessageFlags.IsComponentsV2,
				});
			}
			else {
				await interaction.editReply({
					components: [getSetupContainer(p1Name, p2Name, bestOf, hasBans, chartCount)],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		}

		// build songId lookup keyed by display name for cover art
		const mapPool = charts.map((c) => `${c.title} - ${c.charter}`);
		const chartSongIds = Object.fromEntries(charts.map((c) => [`${c.title} - ${c.charter}`, c.songId]));

		// --- public check-in phase ---
		let checkedIn = false;
		while (!checkedIn) {
			const publicResponse = await interaction.followUp({
				components: [getCheckInContainer(p1Name, p2Name)],
				flags: MessageFlags.IsComponentsV2,
				withResponse: true,
			});

			let p1User = null;
			let p2User = null;

			await new Promise((resolve) => {
				const col = publicResponse.createMessageComponentCollector({
					componentType: ComponentType.StringSelect,
					filter: (i) => i.customId === 'friendly_checkin',
				});

				col.on('collect', async (i) => {
					const slot = i.values[0];

					if (process.env.NODE_ENV !== 'development') {
						if ((slot === 'p1' && p1User?.id === i.user.id) || (slot === 'p2' && p2User?.id === i.user.id)) {
							await i.reply({ content: 'You have already checked in!', flags: MessageFlags.Ephemeral });
							return;
						}
						if ((slot === 'p1' && p2User?.id === i.user.id) || (slot === 'p2' && p1User?.id === i.user.id)) {
							await i.reply({ content: 'You have already checked in as the other player!', flags: MessageFlags.Ephemeral });
							return;
						}
					}

					if (slot === 'p1' && !p1User) {
						p1User = i.user;
						await i.reply({ content: `You have checked in as **${p1Name}**.`, flags: MessageFlags.Ephemeral });
					}
					else if (slot === 'p2' && !p2User) {
						p2User = i.user;
						await i.reply({ content: `You have checked in as **${p2Name}**.`, flags: MessageFlags.Ephemeral });
					}
					else {
						await i.reply({ content: 'That slot is already taken!', flags: MessageFlags.Ephemeral });
						return;
					}

					if (!p1User || !p2User) return;
					col.stop();
					resolve();
				});
			});

			const approvalMsg = await interaction.followUp({
				components: [getRefApprovalContainer(p1User, p2User, p1Name, p2Name)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				withResponse: true,
			});

			let approvalConf;
			try {
				approvalConf = await approvalMsg.awaitMessageComponent({
					filter: (i) => i.user.id === refUserId,
					time: 120_000,
				});
			}
			catch {
				await interaction.followUp({ content: '❌ Ref approval timed out. Please run `/friendly start` again.', flags: MessageFlags.Ephemeral });
				return;
			}

			if (approvalConf.customId === 'friendly_reject') {
				await approvalConf.update({
					components: [
						new ContainerBuilder()
							.setAccentColor(accentColor)
							.addTextDisplayComponents((t) => t.setContent('❌ Rejected. Restarting check-in...')),
					],
					flags: MessageFlags.IsComponentsV2,
				});
				continue;
			}

			await approvalConf.update({
				components: [
					new ContainerBuilder()
						.setAccentColor(accentColor)
						.addTextDisplayComponents((t) => t.setContent('✅ Approved! Starting match...')),
				],
				flags: MessageFlags.IsComponentsV2,
			});

			const state = await initFriendlyMatch(refUserId, p1Name, p2Name, bestOf, mapPool, interaction);
			state.hasBans = hasBans;
			state.chartSongIds = chartSongIds;
			state.player1User = p1User;
			state.player2User = p2User;

			await saveFriendlyState(refUserId);
			checkedIn = true;
			await startFriendlyPickPhase(interaction, state);
		}
	},
};
