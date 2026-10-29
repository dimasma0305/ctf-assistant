process.env.NODB = 'true';
import { expect, test } from 'bun:test';
import { dispatchTool, setTurnAllowedTools } from './tools';

test('an action outside the current plan is rejected even when emitted as a tool call', async () => {
    const turn = {} as any;
    setTurnAllowedTools(turn, ['get_contact_status']);
    for (const name of ['set_reminder', 'creator_contact_members', 'retry_contact_members', 'create_task']) {
        const result = JSON.parse(await dispatchTool(name, {}, turn));
        expect(result.error).toBe('tool_not_available_for_current_request');
    }
});
