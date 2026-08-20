import mongoose, { Model } from "mongoose";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { InstagramWatchStateModel } from "../../../Database/connect";
import {
  instagramDeliverySchema,
  instagramWatchCursorSchema,
} from "../../../Database/instagramDeliverySchema";
import { SubCommand } from "../../../Model/command";
import { normalizeInstagramUsername } from "../../../Services/Instagram/monitor";

const InstagramWatchCursorModel =
  (mongoose.models.InstagramWatchCursor as Model<any> | undefined) ||
  mongoose.model("InstagramWatchCursor", instagramWatchCursorSchema);

const InstagramDeliveryModel =
  (mongoose.models.InstagramDelivery as Model<any> | undefined) ||
  mongoose.model("InstagramDelivery", instagramDeliverySchema);

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("remove")
    .setDescription("Permanently remove an Instagram account from this server")
    .addStringOption((option) =>
      option
        .setName("account")
        .setDescription("Instagram username or profile URL")
        .setRequired(true)
    ),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: ["Ephemeral"],
      });
      return;
    }

    const input = interaction.options.getString("account", true);
    const username = normalizeInstagramUsername(input);
    if (!username) {
      await interaction.reply({
        content: "Invalid Instagram username or profile URL.",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    try {
      const watches = await InstagramWatchStateModel.find({
        guild_id: interaction.guild.id,
        username,
      })
        .select({ _id: 1 })
        .lean();

      if (!watches.length) {
        await interaction.editReply({
          content: `No Instagram monitor for **@${username}** is registered in this server.`,
        });
        return;
      }

      const watchIds = watches.map((watch) => String(watch._id));

      await InstagramWatchStateModel.deleteMany({
        _id: { $in: watches.map((watch) => watch._id) },
      });

      await Promise.all([
        InstagramWatchCursorModel.deleteMany({ watchId: { $in: watchIds } }),
        InstagramDeliveryModel.deleteMany({ watchId: { $in: watchIds } }),
      ]);

      await interaction.editReply({
        content:
          `Permanently removed **@${username}** from this server ` +
          `(${watches.length} channel registration${watches.length === 1 ? "" : "s"}).`,
      });
    } catch (error) {
      console.error("[InstagramRemove] failed:", error);
      await interaction.editReply({
        content: "Failed to remove the Instagram monitor. Please try again.",
      });
    }
  },
};
