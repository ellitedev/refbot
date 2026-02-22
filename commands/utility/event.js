const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createEvent, switchEvent, listEvents, getActiveEvent } = require('../../state/event.js');
const { loadMapPoolFromDB } = require('../../state/mapPool.js');
const { loadGeneratedPoolsFromDB } = require('../../state/generatedPools.js');
const { requireReferee } = require('../../util/requireReferee.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('event')
		.setDescription('Manage tournament events.')
		.addSubcommand((sub) =>
			sub.setName('create')
				.setDescription('Create a new event and set it as active.')
				.addStringOption((o) =>
					o.setName('name').setDescription('Event name').setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub.setName('switch')
				.setDescription('Switch to an existing event.')
				.addStringOption((o) =>
					o.setName('name').setDescription('Event name').setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub.setName('list')
				.setDescription('List all events.'),
		)
		.addSubcommand((sub) =>
			sub.setName('current')
				.setDescription('Show the currently active event.'),
		),

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const sub = interaction.options.getSubcommand();
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (sub === 'create') {
			const name = interaction.options.getString('name');
			try {
				const event = await createEvent(name);
				await loadMapPoolFromDB();
				await loadGeneratedPoolsFromDB();
				await interaction.editReply({ content: `✅ Created and switched to event **${event.name}**.` });
			}
			catch (err) {
				if (err.code === 11000) {
					await interaction.editReply({ content: `❌ An event named **${name}** already exists. Use \`/event switch\` to switch to it.` });
				}
				else {
					await interaction.editReply({ content: `❌ ${err.message}` });
				}
			}
		}
		else if (sub === 'switch') {
			const name = interaction.options.getString('name');
			const event = await switchEvent(name);
			if (!event) {
				await interaction.editReply({ content: `❌ No event named **${name}** found.` });
				return;
			}
			await loadMapPoolFromDB();
			await loadGeneratedPoolsFromDB();
			await interaction.editReply({ content: `✅ Switched to event **${event.name}**. Map pool and pools loaded from database.` });
		}
		else if (sub === 'list') {
			const events = await listEvents();
			if (events.length === 0) {
				await interaction.editReply({ content: 'No events found. Use `/event create` to make one.' });
				return;
			}
			const lines = events.map((e) => `${e.active ? '▶️' : '  '} **${e.name}** — created <t:${Math.floor(e.createdAt / 1000)}:R>`);
			await interaction.editReply({ content: lines.join('\n') });
		}
		else if (sub === 'current') {
			const event = getActiveEvent();
			if (!event) {
				await interaction.editReply({ content: 'No active event. Use `/event create` or `/event switch`.' });
				return;
			}
			await interaction.editReply({ content: `Current event: **${event.name}**` });
		}
	},
};
