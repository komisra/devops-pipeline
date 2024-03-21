const spawn = require('child_process').spawn;

/**
 * Run a command locally, 
 * optionally showing output in real time and
 * returning a promise to indicate when the command has finished
 * 
 * @param {String} command Command to run
 * @param {Array} args Arguments to pass to the command
 * @param {Object} options Options to pass to the command
 * @returns {Promise}
 * 
 * @example
 * const { exec } = require('./exec');
 * 
 * exec('ls', ['-la']).then(() => {
 *   console.log('done');
 * });
 */
async function exec(command, args, options) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, options);

        proc.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject();
            }
        });

        // show output in real time if options.silent is not set
        if (!options || !options.silent) {
            proc.stdout.pipe(process.stdout);
            proc.stderr.pipe(process.stderr);
        }
    });
}

/**
 * Run a command on a remote host using SSH
 * 
 * @param {String} user Username to use for SSH
 * @param {String} host Hostname to connect to
 * @param {String} sshKey Path to the SSH key to use
 * @param {String} command Command to run on the remote host
 * @returns {Promise}
 * 
 * @example
 * const { sshExec } = require('./exec');
 * 
 * sshExec('ubuntu', '1.2.3.4', '/path/to/key', 'ls -la').then(() => {
 *    console.log('done');
 * }
 */
async function sshExec(user, host, sshKey, command) {
    const args = [
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=/dev/null',
        '-o',
        'IdentitiesOnly=yes',
        '-i',
        sshKey,
        `${user}@${host}`,
        command
    ];

    return exec('ssh', args);
}

module.exports = { exec, sshExec };
