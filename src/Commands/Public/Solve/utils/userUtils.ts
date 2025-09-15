import { User as DiscordUser } from "discord.js";
import { UserModel } from "../../../../Database/connect";
import { Types } from "mongoose";

/**
 * Interface for user creation data
 */
export interface UserCreateData {
    discord_id: string;
    username: string;
    display_name: string;
    avatar?: string;
}

/**
 * Creates or updates a user in the database from Discord user data
 * @param discordUser Discord user object
 * @returns User document ObjectId
 */
export async function findOrCreateUser(discordUser: DiscordUser): Promise<Types.ObjectId> {
    try {
        // Try to find existing user by Discord ID
        let user = await UserModel.findOne({ discord_id: discordUser.id });

        if (user) {
            // Update existing user data in case it changed
            const updateData = {
                username: discordUser.username,
                display_name: discordUser.displayName || discordUser.username,
                avatar: discordUser.avatar ? discordUser.displayAvatarURL() : undefined,
                updated_at: new Date()
            };

            // Only update if there are actual changes
            const hasChanges = 
                user.username !== updateData.username ||
                user.display_name !== updateData.display_name ||
                user.avatar !== updateData.avatar;

            if (hasChanges) {
                user = await UserModel.findOneAndUpdate(
                    { discord_id: discordUser.id },
                    updateData,
                    { new: true }
                );
            }
        } else {
            // Create new user
            user = await UserModel.create({
                discord_id: discordUser.id,
                username: discordUser.username,
                display_name: discordUser.displayName || discordUser.username,
                avatar: discordUser.avatar ? discordUser.displayAvatarURL() : undefined,
                created_at: new Date(),
                updated_at: new Date()
            });
        }

        return user!._id as Types.ObjectId;
    } catch (error) {
        console.error(`Error finding/creating user ${discordUser.id}:`, error);
        throw error;
    }
}

/**
 * Creates or updates a user from minimal Discord ID data (when full user object not available)
 * @param discordId Discord user ID
 * @param username Optional username (fallback to ID if not provided)
 * @param displayName Optional display name
 * @param avatar Optional avatar URL
 * @returns User document ObjectId
 */
export async function findOrCreateUserById(
    discordId: string, 
    username?: string, 
    displayName?: string, 
    avatar?: string
): Promise<Types.ObjectId> {
    try {
        // Try to find existing user by Discord ID
        let user = await UserModel.findOne({ discord_id: discordId });

        if (user) {
            // Update existing user data if new info provided
            const updateData: any = {
                updated_at: new Date()
            };

            if (username && user.username !== username) {
                updateData.username = username;
            }
            if (displayName && user.display_name !== displayName) {
                updateData.display_name = displayName;
            }
            if (avatar && user.avatar !== avatar) {
                updateData.avatar = avatar;
            }

            // Only update if there are actual changes beyond timestamp
            if (Object.keys(updateData).length > 1) {
                user = await UserModel.findOneAndUpdate(
                    { discord_id: discordId },
                    updateData,
                    { new: true }
                );
            }
        } else {
            // Create new user with available data
            user = await UserModel.create({
                discord_id: discordId,
                username: username || `User_${discordId}`,
                display_name: displayName || username || `User_${discordId}`,
                avatar: avatar,
                created_at: new Date(),
                updated_at: new Date()
            });
        }

        return user!._id as Types.ObjectId;
    } catch (error) {
        console.error(`Error finding/creating user by ID ${discordId}:`, error);
        throw error;
    }
}

/**
 * Processes multiple Discord users and returns their ObjectIds
 * @param discordUsers Array of Discord user objects
 * @returns Array of User document ObjectIds
 */
export async function processUsersToObjectIds(discordUsers: DiscordUser[]): Promise<Types.ObjectId[]> {
    const userIds: Types.ObjectId[] = [];
    
    for (const discordUser of discordUsers) {
        try {
            const userId = await findOrCreateUser(discordUser);
            userIds.push(userId);
        } catch (error) {
            console.error(`Failed to process user ${discordUser.id}:`, error);
            // Continue with other users instead of failing completely
        }
    }
    
    return userIds;
}

/**
 * Processes Discord user IDs and returns their ObjectIds
 * @param discordIds Array of Discord user ID strings  
 * @returns Array of User document ObjectIds
 */
export async function processUserIdsToObjectIds(discordIds: string[]): Promise<Types.ObjectId[]> {
    const userIds: Types.ObjectId[] = [];
    
    for (const discordId of discordIds) {
        try {
            const userId = await findOrCreateUserById(discordId);
            userIds.push(userId);
        } catch (error) {
            console.error(`Failed to process user ID ${discordId}:`, error);
            // Continue with other users instead of failing completely
        }
    }
    
    return userIds;
}

/**
 * Extracts user IDs from Discord mention string and returns ObjectIds
 * @param players Discord mention string (e.g., "<@123456789> <@987654321>")
 * @param fallbackUserId Fallback Discord user ID if no mentions found
 * @param interaction Optional interaction to get user objects for better data
 * @returns Array of User document ObjectIds
 */
export async function extractAndProcessUserIds(
    players: string | null, 
    fallbackUserId: string,
    interaction?: any
): Promise<Types.ObjectId[]> {
    // Extract Discord IDs from mentions (reusing existing logic)
    const discordIds = extractUserIdsFromMentions(players, fallbackUserId);
    
    // Try to get full user objects if interaction is available
    if (interaction && interaction.guild) {
        try {
            const discordUsers: DiscordUser[] = [];
            
            for (const discordId of discordIds) {
                try {
                    // Try to get user from guild members first (more complete data)
                    const member = await interaction.guild.members.fetch(discordId);
                    if (member?.user) {
                        discordUsers.push(member.user);
                        continue;
                    }
                } catch {
                    // Fallback: try to get user from client
                    try {
                        const user = await interaction.client.users.fetch(discordId);
                        if (user) {
                            discordUsers.push(user);
                            continue;
                        }
                    } catch {
                        // Will use ID-only approach below
                    }
                }
            }
            
            // Process users with full objects if we got them
            if (discordUsers.length === discordIds.length) {
                return await processUsersToObjectIds(discordUsers);
            }
        } catch (error) {
            console.error('Error fetching Discord user objects:', error);
        }
    }
    
    // Fallback: process IDs only
    return await processUserIdsToObjectIds(discordIds);
}

/**
 * Helper function from original thread.ts - kept for compatibility
 */
function extractUserIdsFromMentions(players: string | null, fallbackUserId: string): string[] {
    if (!players) {
        return [fallbackUserId];
    }
    
    const regex = /<@(\d+)>/g;
    const users = players.match(regex)?.map(match => match.slice(2, -1));
    return users || [fallbackUserId];
}
