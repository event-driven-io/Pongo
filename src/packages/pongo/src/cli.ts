import { Command } from 'commander';
import { configCommand, migrateCommand, shellCommand } from './commandLine';

const program = new Command();

program.name('pongo').description('CLI tool for Pongo');

program.addCommand(configCommand);
program.addCommand(migrateCommand);
program.addCommand(shellCommand);

export default program;
