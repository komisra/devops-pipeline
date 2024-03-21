const path = require('path');
const fs = require('fs');
const homedir = require('os').homedir();
const yaml = require('yaml');
const { sshExec } = require('../lib/exec');
const { createDroplet, waitUntilActive, getIPAddress } = require('../lib/do');
const { exit } = require('process');

exports.command = ['init'];
exports.desc = 'provisions and sets up the build environment using a build.yaml file';

exports.builder = yargs => {
    yargs.example('$0 init --build=build.yaml', 'provision and setup the build environment using the setup section of given build.yaml file');

    yargs.options({
        build: {
            describe: 'the path to the build.yaml file',
            demand: true,
            type: 'string',
            alias: 'b',
        }
    });
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

exports.handler = async argv => {
    let { build } = argv;

    // Read the build.yaml file and parse its content
    const buildYamlContent = await fs.promises.readFile(build, 'utf8');
    const buildYamlContentParsed = yaml.parse(buildYamlContent);

    // Create a new droplet instance
    const instanceName = 'build-instance';
    const region = 'nyc1';
    const droplet = await createDroplet(instanceName, region);

    // Announce the instance creation and wait for it to be ready
    console.log(`Instance ${droplet.droplet_id} created`);
    console.log('Waiting for the build instance to be active...');
    await waitUntilActive(droplet.droplet_id);
    var id = droplet.droplet_id;
    const ipAddress = await getIPAddress(droplet.droplet_id);

    // Generate inventory file with IP address of the droplet instance
    const inventory = `[all]\n${ipAddress} ansible_user=root ansible_ssh_private_key_file=~/.ssh/id_rsa\n`;

    // Write inventory file to local directory
    await fs.promises.writeFile('inventory.ini', inventory);

    // Add a 30-second pause before running the commands
    console.log('Waiting for 30 seconds before running commands...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Run each setup command defined in the build.yaml file
    for (const setup of buildYamlContentParsed.setup) {
        console.log(setup);
        if (setup.command) {
            // Run a command on the droplet instance
            const command = setup.command;
            console.log(`Running command: ${command}`);
            await sleep(5000);
            await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), command);
            console.log(`Command '${command}' has finished running`);
        } else if (setup.apt) {
            // Install an apt package on the droplet instance
            const package = setup.apt;
            console.log(`Installing package: ${package}`);
            await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `apt-get -y install ${package}`);
            console.log(`Apt command for package '${package}' has finished running`);
        } else if (setup.git) {
            // Clone a git repository on the droplet instance
            const repo = setup.git;
            console.log(`Cloning repository: ${repo}`);
            await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `git clone ${repo}`);
            console.log(`Git clone for repository '${repo}' has finished running`);
        } else if (setup.playbook) {
            const playbook = setup.playbook;
            console.log(`Running playbook: ${playbook}`);
      
            // Run the ansible playbook on the instance
            // The `ansible-playbook` command is used to run the playbook
            // The `-i` option specifies the inventory file
            await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `ansible-playbook ${setup.playbook} -i inventory.ini`);
            console.log(`Ansible playbook '${playbook}' has finished running`);
          } else {
            console.error('unknown setup command');
          }
        }
      
        // All the commands have finished running
        console.log('All commands have finished running');
      
        // run a command over ssh:
        // sshExec('USERNAME', 'IP_ADDRESS', path.join(homedir, '/.ssh/id_rsa'), 'ls -al').then(() => {
        //     console.log('done');
        // });
      };

