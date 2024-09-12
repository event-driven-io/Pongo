#!/usr/bin/env node
import { Command } from 'commander';
import { migrateCommand } from './commandLine';

const program = new Command();

program.name('pongo').description('CLI tool for Pongo');

program.addCommand(migrateCommand);

program.parse(process.argv);

export default program;
