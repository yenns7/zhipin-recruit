import assert from 'node:assert/strict';
import config from '../vite.config.ts';

assert.equal(config.server.port, 5173);
assert.equal(config.server.strictPort, true);
assert.equal(config.server.proxy['/api'].target, 'http://localhost:5001');
