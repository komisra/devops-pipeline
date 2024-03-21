#!/usr/bin/env node
const yargs = require('yargs');
const { version } = require('./package.json');
const { exit } = require('yargs');

// init dotenv to load the environment variables from the .env file
require('dotenv').config();

yargs
    .middleware(preReqs)
    .commandDir('./commands')
    .version()
    .epilog(version ? `Version: ${version}` : '')
    .demandCommand(1, 'Did you forget to specify a command?')
    .recommendCommands()
    .showHelpOnFail(false, 'Specify --help for available options')
    .strict(true)
    .help()
    .wrap(yargs.terminalWidth())
    .argv

function preReqs() {
    if (!process.env.DO_TOKEN || process.env.DO_TOKEN == '') {
        console.error('You must set a DO_TOKEN environment variable to run this app.');
        exit(1);
    }
    // Optionally check for environment variables here if you need them to run the app
    // if (!process.env.FOO || process.env.FOO == '') {
    //     console.error('You must set FOO environment variable to to run this app.');
    //     exit(1);
    // }
}