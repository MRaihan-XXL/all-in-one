#!/usr/bin/env node
// Secondary-name alias: delegate to the real aio CLI with the user's argv intact.
// aio decides "am I the invoked script?" from argv[1] ending in `aio.js`, so
// point argv[1] at the installed entry BEFORE importing it — commands, flags
// (argv[2..]) and output are then identical to running `aio` directly.
import { fileURLToPath } from 'node:url';
process.argv[1] = fileURLToPath(import.meta.resolve('aio-connect/bin/aio.js'));
await import('aio-connect/bin/aio.js');
