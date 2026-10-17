import { expect, test } from 'bun:test';
import { extractChallengeInfoFromThread, extractChallengeNameFromThread } from './thread';

test('member-created solved threads without a category resolve to the original challenge name', () => {
  expect(extractChallengeInfoFromThread('✅ osint/rabbithole')).toEqual({ category: 'Unknown', challengeName: 'osint/rabbithole' });
  expect(extractChallengeNameFromThread('❌ osint/rabbithole')).toBe('osint/rabbithole');
  expect(extractChallengeInfoFromThread('✅ [OSINT] RabbitHole')).toEqual({ category: 'OSINT', challengeName: 'RabbitHole' });
});
