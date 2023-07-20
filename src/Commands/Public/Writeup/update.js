const {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
	ActionRowBuilder,
	TextInputStyle,
	ModalBuilder,
	TextInputBuilder,
} = require("discord.js");
const { GitHelper } = require("../../../Functions/git-helper");
const { JekyllHelper } = require("../../../Functions/jekly-helper");

const { REPO } = process.env

module.exports = {
	subCommand: "writeup.update",
	data: new SlashCommandSubcommandBuilder()
		.setName('update')
		.setDescription('update writeup on repo'),
	/**
	 *
	 * @param {ChatInputCommandInteraction} interaction
	 * @param {Client} _client
	 */
	async execute(interaction, _client) {
		const repo = new GitHelper(REPO)
		const jekly = new JekyllHelper(repo.getRepoName())

		const modal = new ModalBuilder()
			.setCustomId('modal')
			.setTitle('Update')

		modal.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('title')
					.setLabel("title")
					.setStyle(TextInputStyle.Short),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('content')
					.setLabel("content")
					.setStyle(TextInputStyle.Paragraph)
			)
		);


		await interaction.showModal(modal);

		const submission = await interaction.awaitModalSubmit({ time: 60 * 60 * 1000 });

		await submission.deferReply({ ephemeral: true })

		repo.checkAndCloneRepo()
		repo.pullFromRepo()

		const title = submission.fields.getTextInputValue('title')
		const content = submission.fields.getTextInputValue('content')

		jekly.createPost(title, content)
		repo.pushToRepo(Date())

		await submission.deleteReply({ ephemeral: true })
	},
};
