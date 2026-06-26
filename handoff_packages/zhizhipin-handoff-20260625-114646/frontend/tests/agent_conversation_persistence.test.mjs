import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const agent = readSource('lib/agent.ts');
assert.match(agent, /conversation_started/, 'Agent SSE type should include conversation_started');
assert.match(agent, /conversationId\?: number \| null/, 'streamChat should accept an optional conversation id');
assert.match(agent, /body\.conversation_id = conversationId/, 'streamChat should send conversation_id to backend');

const chat = readSource('lib/agentChat.tsx');
assert.match(chat, /STORAGE_KEY_CONV/, 'Agent chat should persist the current conversation id');
assert.match(chat, /conversationId/, 'Agent chat context should expose conversationId');
assert.match(chat, /loadConversationMessages/, 'Agent chat context should load stored conversation messages');
assert.match(chat, /hydrateMessagesFromDb/, 'Agent chat context should hydrate UI messages from backend messages');
assert.match(chat, /\/api\/agent\/conversations\/\$\{id\}/, 'Agent chat should fetch conversation detail');

const page = readSource('pages/AgentPage.tsx');
assert.match(page, /conversationId/, 'Agent page should read the active conversation id');
assert.match(page, /setConversationId/, 'Agent page should update the active conversation id');
assert.match(page, /conversation_started/, 'Agent page should handle the conversation_started stream event');
