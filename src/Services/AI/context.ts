import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { getChannelCache, updateChannelCache } from "./cache";


// Generate unique separator to prevent prompt injection
export function generateUniqueSeparator(): string {
  return `---${Date.now()}-${Math.random().toString(36).substring(2, 15)}---`;
}

// Enhanced function to get channel context (last 10 messages)
export async function getChannelContext(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>, startSep: string, endSep: string): Promise<string> {
  try {
    const channelId = message.channel.id;
    let contextMessages: string[];

    const cachedMessages = await getChannelCache(channelId);
    // Get messages before the current one. The current message is the last in the cache.
    const relevantCachedMessages = cachedMessages.slice(Math.max(0, cachedMessages.length - 11), -1);

    // Use cache if it has a reasonable number of preceding messages
    if (relevantCachedMessages.length >= 5) {
      console.log(`[Cache] HIT for channel ${channelId}. Using ${relevantCachedMessages.length} cached messages for context.`);
      contextMessages = relevantCachedMessages.map((msg: any) => {
        const timestamp = new Date(msg.createdTimestamp).toLocaleTimeString('id-ID');
        const authorName = msg.member?.displayName || msg.author.username;
        const content = msg.content || '[attachment/embed]';
        return `[${timestamp}] ${authorName}: ${content}`;
      });
    } else {
      console.log(`[Cache] MISS for channel ${channelId}. Fetching from API to populate context.`);
      const fetchedMessages = await message.channel.messages.fetch({ limit: 10, before: message.id });
      const messageArray = Array.from(fetchedMessages.values()).reverse();

      // The cache is populated by the MessageCreate event, but we can prime it here on a miss
      // to ensure context is available for the next message without another fetch.
      for (const msg of messageArray) {
        await updateChannelCache(msg as DiscordMessage);
      }
      
      contextMessages = messageArray.map(msg => {
        const timestamp = new Date(msg.createdTimestamp).toLocaleTimeString('id-ID');
        const authorName = msg.member?.displayName || msg.author.username;
        const content = msg.content || '[attachment/embed]';
        return `[${timestamp}] ${authorName}: ${content}`;
      });
    }
    
    return contextMessages.length > 0 
      ? `\n${startSep} Recent Channel Context (Last 10 messages) ${startSep}\n${contextMessages.join('\n')}\n${endSep} End Context ${endSep}`
      : '';
  } catch (error) {
    console.error('Error fetching channel context:', error);
    return '';
  }
}

// Enhanced function to get user information
export async function getUserInfo(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<string> {
  try {
    const member = message.member;
    if (!member) return `User: ${message.author.username} (${message.author.id})`;
    
    const joinedAt = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString('id-ID') : 'Unknown';
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .slice(0, 5); // Limit to 5 roles to avoid token overflow
    
    const rolesStr = roles.length > 0 ? roles.join(', ') : 'No special roles';
    const nickname = member.displayName !== message.author.username ? ` (${member.displayName})` : '';
    
    return `User Info: ${message.author.username}${nickname} (ID: ${message.author.id})
Join Date: ${joinedAt}
Roles: ${rolesStr}
Server Boost: ${member.premiumSince ? 'Yes' : 'No'}`;
  } catch (error) {
    console.error('Error getting user info:', error);
    return `User: ${message.author.username} (${message.author.id})`;
  }
}

// Enhanced function to get reply context
export async function getReplyContext(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>, startSep: string, endSep: string): Promise<string> {
  try {
    if (!message.reference?.messageId) return '';
    
    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
    const referencedAuthor = referencedMessage.member?.displayName || referencedMessage.author.username;
    const referencedContent = referencedMessage.content || '[attachment/embed]';
    const timestamp = new Date(referencedMessage.createdTimestamp).toLocaleTimeString('id-ID');
    
    return `\n${startSep} User is replying to this message ${startSep}
[${timestamp}] ${referencedAuthor}: ${referencedContent}
${endSep} End Reply Context ${endSep}`;
  } catch (error) {
    console.error('Error getting reply context:', error);
    return '';
  }
}

// Enhanced environment context with channel awareness
export function getEnvironmentContext(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): string {
  const guildName = message.guild?.name || 'Direct Message';
  const channel = message.channel as any;
  const channelName = channel?.name ? `#${channel.name}` : 'DM';
  const channelTopic = channel?.topic || 'No topic set';
  const channelType = channel?.type || 'unknown';
  const isNSFW = channel?.nsfw || false;
  const memberCount = message.guild?.memberCount || 0;
  
  const now = new Date();
  const timeStr = now.toLocaleString('id-ID', { 
    hour12: false,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const botTag = message.client.user?.tag || 'Hackerika';
  
  // Analyze channel purpose based on name
  let channelPurpose = 'general discussion';
  const lowerChannelName = channelName.toLowerCase();
  
  if (lowerChannelName.includes('ctf') || lowerChannelName.includes('challenge')) {
    channelPurpose = 'CTF challenges and competitions';
  } else if (lowerChannelName.includes('help') || lowerChannelName.includes('support')) {
    channelPurpose = 'technical help and support';
  } else if (lowerChannelName.includes('announce') || lowerChannelName.includes('info')) {
    channelPurpose = 'announcements and information';
  } else if (lowerChannelName.includes('general') || lowerChannelName.includes('chat')) {
    channelPurpose = 'casual conversation';
  } else if (lowerChannelName.includes('mabar')) {
    channelPurpose = 'team coordination and collaboration';
  } else if (lowerChannelName.includes('off') && lowerChannelName.includes('topic')) {
    channelPurpose = 'off-topic discussions';
  } else if (lowerChannelName.includes('resource') || lowerChannelName.includes('tool')) {
    channelPurpose = 'sharing resources and tools';
  }
  
  return `Environment: 
Guild: ${guildName} (${memberCount} members)
Channel: ${channelName} 
Channel Topic: "${channelTopic}"
Channel Purpose: ${channelPurpose}
Channel Type: ${channelType}${isNSFW ? ' (NSFW)' : ''}
Current Time: ${timeStr}
Bot Identity: ${botTag}`;
}
