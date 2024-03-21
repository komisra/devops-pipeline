// Import necessary libraries and modules
const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();
const yaml = require('yaml');
const {
   runPlaybook,
   sshExec
} = require('../lib/exec');
const {
   exit
} = require('process');
const { createDroplet, waitUntilActive, getIPAddress, scp } = require('../lib/do');

// Configure the command, description, and options for the CLI app
exports.command = ['build'];
exports.desc = 'run a build based on the configuration given in the build.yaml file';
exports.builder = yargs => {
   yargs.example('$0 build --job=build --build=build.yaml', 'run the job with the name "build" using the build.yaml file');

   yargs.options({
      jobs: {
         describe: 'name of the job to run',
         demand: true,
         type: 'string',
         alias: 'j',
      },
      build: {
         describe: 'the path to the build.yaml file',
         demand: true,
         type: 'string',
         alias: 'b',
      }
   });
};

// Handler function for the 'build' command
exports.handler = async argv => {
   let {
      jobs,
      build
   } = argv;

   // Read the inventory.ini file and extract the IP address of the server
   const inventoryIniContent = await fs.promises.readFile("inventory.ini", 'utf8');
   const ipAddress = inventoryIniContent.split('\n')[1].split(' ')[0];
   console.log(`Build IP address: ${ipAddress}`);

   // Read the build.yaml file and parse its content
   const buildYamlContent = await fs.promises.readFile(build, 'utf8');
   const buildYamlContentParsed = yaml.parse(buildYamlContent);

   // Check that the specified job is defined in the build.yaml file
   if (!buildYamlContentParsed.jobs[jobs]) {
       console.error(`Job '${jobs}' not found in build.yaml`);
       exit(1);
   }

   const executedJobs = new Set();

   const runJob = async jobName => {
      if (buildYamlContentParsed.jobs[jobName]) {
         for (const task of buildYamlContentParsed.jobs[jobName]) {
            if (task.command) {
               const command = task.command;
               console.log(`Running command: ${command}`);
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), command);
               console.log(`Command '${command}' has finished running`);
            } else if (task.apt) {
               const package = task.apt;
               console.log(`Installing package: ${package}`);
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `apt-get -y install ${package}`);
               console.log(`Apt command for package '${package}' has finished running`);
            } else if (task.git) {
               const repo = task.git;
               console.log(`Cloning repository: ${repo}`);
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `git clone ${repo}`);
               console.log(`Git clone for repository '${repo}' has finished running`);
            } else if (task.playbook) {
               const playbook = task.playbook;
               console.log(`Running playbook: ${playbook}`);
               await runPlaybook(path.join(__dirname, `../playbooks/${playbook}`), 'root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), path.join(__dirname, '../playbooks/roles'));
               console.log(`Ansible playbook '${playbook}' has finished running`);
            } else if (task.eslint) {
               const eslintDir = task.eslint.dir;
               const eslintRules = task.eslint.rules;
               const rulesString = Object.entries(eslintRules).map(([key, value]) => `--rule "${key}:${value}"`).join(' ');

               console.log(`Running ESLint on directory: ${eslintDir}`);
               const eslintCommand = `eslint ${eslintDir} --no-eslintrc --no-inline-config --env es6,node --parser-options=sourceType:module ${rulesString}`;
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `npm install -g eslint && ${eslintCommand}`);
               console.log(`ESLint for directory '${eslintDir}' has finished running`);
            // Check for the blue-green deployment directive
            } else if (task['blue-green']) {
               const blueGreenTasks = task['blue-green'];
               const healthcheck = task['blue-green'].healthcheck;

               // Provision blue-green deployment server
               const instanceName = 'deployment-instance';
               const region = 'nyc1';
               const droplet = await createDroplet(instanceName, region);

               // Announce the instance creation and wait for it to be ready
               console.log(`Instance ${droplet.droplet_id} created`);
               console.log('Waiting for the deployment instance to be active...');
               await waitUntilActive(droplet.droplet_id);
               var id = droplet.droplet_id;
               const ipAddress = await getIPAddress(droplet.droplet_id);

               // Read the current content of inventory.ini, filter out deployment-instance lines, and join the lines back together
               const currentInventoryContent = (await fs.promises.readFile('inventory.ini', 'utf8')).split('\n').filter(line => !line.includes('deployment-instance')).join('\n');

               // Append the IP address of the deployment instance to the filtered content
               const newInventoryContent = `${currentInventoryContent}\n${ipAddress} ansible_user=root ansible_ssh_private_key_file=~/.ssh/id_rsa deployment-instance\n`;

               // Overwrite the inventory.ini file with the new content
               await fs.promises.writeFile('inventory.ini', newInventoryContent);

               // Add a 5-second pause before running the commands
               console.log('Waiting for 30 seconds before running commands...');
               await new Promise(resolve => setTimeout(resolve, 30000));

               // Create the directories for the blue and green deployments
               console.log("Creating '~/blue' and '~/green' directories");
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), 'mkdir -p ~/blue && mkdir -p ~/green');
               console.log("Directories '~/blue' and '~/green' created");

               console.log('Waiting for 5 seconds before running Docker install...');
               await new Promise(resolve => setTimeout(resolve, 5000));
               await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), `curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh`);
               
               console.log('Waiting for 5 seconds before running Node install...');
               await new Promise(resolve => setTimeout(resolve, 5000));              
               await sshExec(`root`, ipAddress, path.join(homedir, '/.ssh/id_rsa'), `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`)

               // Run blue and green instances
               for (const blueGreenTask of blueGreenTasks) {
                  const runCommand = blueGreenTask.command;
                  console.log("Running command " + runCommand);
                  // console.log('Waiting for 5 seconds before running Docker containers...');
                  // await new Promise(resolve => setTimeout(resolve, 5000));
                  const commandOutput = await sshExec('root', ipAddress, path.join(homedir, '/.ssh/id_rsa'), runCommand);
                  // console.log('Waiting for 5 seconds before finishing container pull...');
                  // await new Promise(resolve => setTimeout(resolve, 5000));
                  console.log(`Check healthcheck route by visiting http://${ipAddress}${healthcheck}\n`);
               }

                // Create proxy folder on deployment server
                await sshExec(`root`, ipAddress, path.join(homedir, '/.ssh/id_rsa'), `mkdir proxy`)

                // Copy proxy/index.js to the deployment server
                await scp(`root`, ipAddress, path.join(homedir, '/.ssh/id_rsa'), 'proxy/index.js', 'proxy/index.js');

                // Initialize npm project and install necessary packages in proxy folder
                await sshExec(`root`, ipAddress, path.join(homedir, '/.ssh/id_rsa'), `cd proxy && npm init -y && npm install http-proxy axios`);
                
                // Run index.js on deployment server
                console.log("Running proxy on deployment-instance");
                await sshExec(`root`, ipAddress, path.join(homedir, '/.ssh/id_rsa'), `cd proxy && node index.js`);
               
            } else {
               console.error('unknown task command');
            }
         }
      } else {
         console.log(`Job '${jobName}' not found in build.yaml`);
      }
   };

   // if the job doesn't have any dependencies, run it alone
   await runJob(jobs);

   console.log('All jobs have finished running');
   console.log('Exiting...');
   exit();
};
