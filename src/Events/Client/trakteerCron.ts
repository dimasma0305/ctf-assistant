import { TextChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { TrakteerModel, TrakteerSchemaType } from "../../Database/connect";
import { EmbedBuilder } from "discord.js";

interface TrakteerSupport {
  supporter_name: string;
  support_message: string;
  quantity: number;
  amount: number;
  unit_name: string;
  updated_at: string;
  payment_method?: string;
  order_id?: string;
}

interface TrakteerResponse {
  status: string;
  status_code: number;
  result: {
    data: TrakteerSupport[];
  };
  message: string;
}

export const event: Event = {
  name: "clientReady",
  once: true,
  async execute(client: MyClient) {
    console.log("Loading Trakteer cron jobs...");

    // Function to check for new Trakteer supports
    async function checkTrakteerSupports() {
      try {
        const activeConfigs = await TrakteerModel.find({
          is_active: true,
        });

        for (const config of activeConfigs) {
          try {
            // Find the channel
            const channel = client.channels.cache.get(
              config.channel_id
            ) as TextChannel;
            if (!channel) {
              console.log(
                `Channel ${config.channel_id} not found for Trakteer updates`
              );
              continue;
            }

            // Fetch support history from Trakteer API
            const response = await fetch(
              "https://api.trakteer.id/v1/public/supports",
              {
                method: "GET",
                headers: {
                  key: config.api_key,
                  Accept: "application/json",
                  "X-Requested-With": "XMLHttpRequest",
                },
              }
            );

            if (!response.ok) {
              console.log(
                `Trakteer API request failed: ${response.status} ${response.statusText}`
              );
              continue;
            }

            const data = await response.json() as TrakteerResponse;

            if (data.status !== "success" || !data.result?.data) {
              console.log(`Trakteer API returned non-success status: ${data.message}`);
              continue;
            }

            const supports = data.result.data;

            if (supports.length === 0) {
              console.log("No supports found in Trakteer response");
              config.last_checked = new Date();
              await config.save();
              continue;
            }

            // Filter for new supports based on timestamp
            const lastCheckedTime = config.last_checked || new Date(0); // Epoch if never checked
            const newSupports: TrakteerSupport[] = [];

            for (const support of supports) {
              // Parse Trakteer timestamp (format: "2025-10-13 16:24:04")
              const supportDate = new Date(support.updated_at.replace(' ', 'T') + '+07:00'); // Asia/Jakarta timezone
              
              if (supportDate > lastCheckedTime) {
                newSupports.push(support);
              }
            }

            if (newSupports.length === 0) {
              console.log("No new Trakteer supports since last check");
              config.last_checked = new Date();
              await config.save();
              continue;
            }

            // Reverse to show oldest first
            newSupports.reverse();

            console.log(`Found ${newSupports.length} new support(s) since ${lastCheckedTime.toISOString()}`);

            // Send notification for each new support
            for (const support of newSupports) {
              await sendTrakteerNotification(channel, support, config);
            }

            // Update last checked time to now
            config.last_checked = new Date();
            await config.save();

            console.log(
              `Processed ${newSupports.length} new Trakteer support(s)`
            );
          } catch (error) {
            console.error(
              `Error checking Trakteer for guild ${config.guild_id}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error("Error in Trakteer cron job:", error);
      }
    }

    // Run every 5 minutes
    cron.schedule(
      "*/5 * * * *",
      async () => {
        await checkTrakteerSupports();
      },
      {
        scheduled: true,
        timezone: "Asia/Singapore",
      }
    );

    // Run once at startup (after 10 seconds)
    setTimeout(async () => {
      await checkTrakteerSupports();
    }, 10000);
  },
};

// Function to send Trakteer notification to channel
async function sendTrakteerNotification(
  channel: TextChannel,
  support: TrakteerSupport,
  config: TrakteerSchemaType
) {
  try {
    const embed = new EmbedBuilder()
      .setTitle("🎉 New Trakteer Support!")
      .setDescription(
        support.support_message || "_No message provided_"
      )
      .addFields(
        {
          name: "Supporter",
          value: support.supporter_name || "Anonymous",
          inline: true,
        },
        {
          name: "Amount",
          value: `Rp ${support.amount.toLocaleString("id-ID")}`,
          inline: true,
        },
        {
          name: "Quantity",
          value: `${support.quantity}x ${support.unit_name}`,
          inline: true,
        }
      )
      .setColor(0xff6b35) // Trakteer orange color
      .setTimestamp(new Date(support.updated_at));

    // Add payment method if available
    if (support.payment_method) {
      embed.addFields({
        name: "Payment Method",
        value: support.payment_method,
        inline: true,
      });
    }

    // Set color to Trakteer orange
    embed.setColor(0xff6b35);
    if (config.page_url) {
      embed.setURL(config.page_url);
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error sending Trakteer notification:", error);
  }
}

