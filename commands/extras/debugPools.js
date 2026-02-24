const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getGeneratedPools } = require('../../state/generatedPools.js');
const { requireReferee } = require('../../util/requireReferee.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('debugpools')
		.setDescription('Debug the generated pools structure'),

	async execute(interaction) {
		if (!await requireReferee(interaction)) return;

		const pools = getGeneratedPools();

		if (!pools) {
			await interaction.reply({
				content: 'No pools generated yet!',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		let debugInfo = '**Generated Pools Structure:**\n\n';

		pools.forEach((bracket, bIndex) => {
			debugInfo += `**Bracket ${bIndex + 1}: ${bracket.name}**\n`;

			bracket.rounds.forEach((round, rIndex) => {
				debugInfo += `  Round ${rIndex + 1}: ${round.name}\n`;
				debugInfo += `    Matches: ${round.matches?.length || 0}\n`;

				// Show first match structure as example
				if (round.matches && round.matches.length > 0) {
					const firstMatch = round.matches[0];
					debugInfo += `    First match type: ${Array.isArray(firstMatch) ? 'Array' : (firstMatch?.charts ? 'Object with charts' : 'Unknown')}\n`;
					if (firstMatch?.charts) {
						debugInfo += `    Charts in first match: ${firstMatch.charts.length}\n`;
					}
					else if (Array.isArray(firstMatch)) {
						debugInfo += `    Charts in first match: ${firstMatch.length}\n`;
					}
				}
				debugInfo += '\n';
			});
		});

		// Split if too long
		if (debugInfo.length > 2000) {
			debugInfo = debugInfo.substring(0, 1900) + '...\n(Message truncated)';
		}

		await interaction.reply({
			content: debugInfo,
			flags: MessageFlags.Ephemeral,
		});
	},
};