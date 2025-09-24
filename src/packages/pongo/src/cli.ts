#!/usr/bin/env node
import { Command } from 'commander';
import { configCommand, migrateCommand, shellCommand } from './commandLine';

export * from './storage/all';

const program = new Command();

program.name('pongo').description('CLI tool for Pongo');

program.addCommand(configCommand);
program.addCommand(migrateCommand);
program.addCommand(shellCommand);

program.parse(process.argv);

export default program;
