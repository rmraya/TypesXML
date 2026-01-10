#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const esmDir = join(__dirname, '..', 'dist', 'esm');
mkdirSync(esmDir, { recursive: true });

const pkgPath = join(esmDir, 'package.json');
const pkgContents = {
  type: 'module'
};

writeFileSync(pkgPath, JSON.stringify(pkgContents, null, 2));
