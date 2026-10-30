import { expect,test } from 'bun:test';
import { parseManagerRoute } from './modelRouter';

test('semantic manager route accepts only confident supported model decisions',()=>{
    expect(parseManagerRoute('{"model":"gpt-5.6-sol","confidence":0.91}')).toBe('gpt-5.6-sol');
    expect(parseManagerRoute('{"model":"gpt-6.1-sol","confidence":0.8}')).toBe('gpt-6.1-sol');
    expect(parseManagerRoute('{"model":"gpt-daybreak-blue-latest","confidence":1}')).toBeNull();
    expect(parseManagerRoute('{"model":"gpt-5.6-sol","confidence":0.4}')).toBeNull();
    expect(parseManagerRoute('not json')).toBeNull();
});
