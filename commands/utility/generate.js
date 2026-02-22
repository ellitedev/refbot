const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { getPool } = require('../../state/mapPool.js');
const { generatePools } = require('../../state/poolGenerator.js');
const { setGeneratedPools } = require('../../state/generatedPools.js');
const { getActiveEvent } = require('../../state/event.js');
const { requireReferee } = require('../../util/requireReferee.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('generate')
		.setDescription('Generate all match pools for the tournament.'),

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const event = getActiveEvent();
		if (!event) {
			await interaction.editReply({ content: '❌ No active event! Use `/event create` or `/event switch` first.' });
			return;
		}

		try {
			const bracketsPath = path.join(__dirname, '..', '..', 'Brackets.json');
			if (!fs.existsSync(bracketsPath)) {
				await interaction.editReply({ content: '❌ `Brackets.json` not found in the bot root directory.' });
				return;
			}

			const bracketsConfig = JSON.parse(fs.readFileSync(bracketsPath, 'utf8'));

			const tierPools = {};
			for (const tier of [1, 2, 3, 4]) {
				const charts = getPool(tier);
				tierPools[tier] = charts.map((c, i) => ({ name: c.csvName, index: i, songId: c.songId ?? null }));
			}

			const pools = generatePools(tierPools, bracketsConfig);
			await setGeneratedPools(pools);

			const lines = [];
			for (const bracket of pools) {
				lines.push(`**${bracket.name}**`);
				for (const round of bracket.rounds) {
					lines.push(`  ${round.name}: ${round.matches.length} match(es), ${round.matches[0]?.length ?? 0} charts each`);
				}
			}

			await interaction.editReply({ content: `✅ Pools generated and saved for event **${event.name}**!\n${lines.join('\n')}` });
		}
		catch (err) {
			await interaction.editReply({ content: `❌ Failed to generate pools: ${err.message}` });
		}
	},
};
