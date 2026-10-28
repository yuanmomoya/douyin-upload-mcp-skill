import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('both publishing tools expose scheduled time through MCP without launching a browser', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/mcp-server.js', import.meta.url))],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'schedule-schema-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    for (const name of ['douyin_publish_video', 'douyin_publish_imagetext']) {
      const tool = tools.find(tool => tool.name === name);
      assert.ok(tool, name);
      assert.equal(tool.inputSchema.properties.scheduleAt.type, 'string');
      assert.ok(!tool.inputSchema.required?.includes('scheduleAt'));
    }
  } finally {
    await client.close();
  }
});
