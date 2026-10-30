import { expect,test } from 'bun:test';
import { AGENT_SESSION_TOOL_NAMES,contactScopedToolNames,type ContactIntent } from './contactIntent';

const plan=(intent:ContactIntent['intent']):ContactIntent=>({intent,audience:'selected',deliveryMode:'dm',includeCreator:false,excludeConfirmed:false});

test('agent session controls remain available when a contact plan narrows outbound tools',()=>{
    for(const intent of ['send','retry','status'] as const){
        const tools=contactScopedToolNames(plan(intent));
        for(const name of AGENT_SESSION_TOOL_NAMES)expect(tools?.has(name)).toBe(true);
    }
    expect(contactScopedToolNames(plan('status'))?.has('creator_contact_members')).toBe(false);
    expect(contactScopedToolNames(plan('none'))).toBeNull();
});
