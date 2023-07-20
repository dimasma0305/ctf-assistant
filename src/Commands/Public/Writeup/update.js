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
		.setDescription('update writeup on repo')
		.addAttachmentOption(option => option
			.setName("file")
			.description("File to upload")
			.setRequired("true")
		),
	/**
	 *
	 * @param {ChatInputCommandInteraction} interaction
	 * @param {Client} _client
	 */
	async execute(interaction, _client) {
		const repo = new GitHelper(REPO)
		const jekly = new JekyllHelper(repo.getRepoName())

		const file = interaction.options.getAttachment("file")

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
		);


		await interaction.showModal(modal);

		const submission = await interaction.awaitModalSubmit({ time: 60 * 60 * 1000 });

		await submission.deferReply({ ephemeral: true })

		repo.checkAndCloneRepo()
		repo.pullFromRepo()

		const title = submission.fields.getTextInputValue('title')
		const content = await (await fetch(file.url)).text()

		jekly.createPost(title, content)
		repo.pushToRepo(Date())

		await submission.deleteReply({ ephemeral: true })
	},
};
