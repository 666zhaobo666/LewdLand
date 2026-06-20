'use strict';

const { initAdmin } = require('./db');
const { scanAll } = require('./services/scanner');

async function main() {
  initAdmin();
  const cmd = process.argv[2];
  if (cmd === 'scan') {
    console.log('Scanning all enabled sources ...');
    const results = await scanAll({
      onProgress: (type, msg) => console.log(`[${type}] ${msg}`)
    });
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Usage: node server/cli.js scan');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
