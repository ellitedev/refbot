const { SlashCommandBuilder, MessageFlags, ComponentType } = require('discord.js');
const { getMatchState } = require('../../state/match.js');
const { getActiveEvent } = require('../../state/event.js');
const MatchModel = require('../../models/Match.js');
const { getSimpleContainer } = require('../../ui/matchContainers.js');
const { ContainerBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const accentColor = 0x40ffa0;

function getCleanContainer(stuckMatches) {
	const lines = stuckMatches.map((m, i) =>
		`**${i + 1}.** ${m.round} — Match #${m.matchNumber} *(${m.status})* | Score: ${m.score[0]}-${m.score[1]} | Started <t:${Math.floor(new Date(m.startedAt).getTime() / 1000)}:R>`,
	).join('\n');

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents((t) => t.setContent(`## Stuck Matches\nThe following matches are stuck and blocking progress:\n\n${lines}`))
		.addSeparatorComponents((s) => s)
		.addTextDisplayComponents((t) => t.setContent('**Mark as completed** — preserves match data and allows the slot to be restarted.\n**Delete** — permanently removes the match records.'))
		.addActionRowComponents((row) =>
			row.setComponents(
				new ButtonBuilder().setCustomId('clean_complete').setLabel('Mark as Completed').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId('clean_delete').setLabel('Delete').setStyle(ButtonStyle.Danger),
			),
		);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('clean')
		.setDescription('Clean up stuck or abandoned matches.'),

	async execute(interaction) {
		const event = getActiveEvent();
		if (!event) {
			await interaction.reply({ content: '❌ No active event!', flags: MessageFlags.Ephemeral });
			return;
		}

		const activeState = getMatchState();
		const activeId = activeState?._id?.toString();

		const stuckMatches = await MatchModel.find({
			event: event._id,
			status: { $in: ['in_progress', 'restarted'] },
		}).sort({ startedAt: 1 });

		const stuck = stuckMatches.filter((m) => m._id.toString() !== activeId);

		if (stuck.length === 0) {
			await interaction.reply({ content: '✅ No stuck matches found!', flags: MessageFlags.Ephemeral });
			return;
		}

		const stuckIds = stuck.map((m) => m._id);

		const response = await interaction.reply({
			components: [getCleanContainer(stuck)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			withResponse: true,
		});

		const conf = await response.resource.message.awaitMessageComponent({
			filter: (i) => i.user.id === interaction.user.id,
			componentType: ComponentType.Button,
		});

		if (conf.customId === 'clean_complete') {
			await MatchModel.updateMany(
				{ _id: { $in: stuckIds } },
				{ status: 'completed', completedAt: new Date() },
			);
			await conf.update({
				components: [getSimpleContainer(`✅ Marked ${stuck.length} match(es) as completed.`)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
		else if (conf.customId === 'clean_delete') {
			await MatchModel.deleteMany({ _id: { $in: stuckIds } });
			await conf.update({
				components: [getSimpleContainer(`🗑️ Deleted ${stuck.length} match(es).`)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
	},
};
