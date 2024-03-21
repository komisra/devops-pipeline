const axios = require('axios');

const { exec } = require('../lib/exec');

/**
 * Create a new droplet on DigitalOcean
 */
async function createDroplet(instanceName, region) { 

  const keysArray = await getSSHKeys();

  const response = await axios.post('https://api.digitalocean.com/v2/droplets', {
    name: instanceName,
    region: region,
    size: 's-1vcpu-2gb',
    image: 'ubuntu-20-04-x64',
    ssh_keys: keysArray
  }, {
    headers: {
      Authorization: `Bearer ${process.env.DO_TOKEN}`,
    },
  });

  const droplet_id = response.data.droplet.id;
  

  return {
    droplet: response.data.droplet,
    droplet_id: droplet_id,
  };

  
}
// Return ip address for droplet with given id
async function getIPAddress(droplet_id) {

  const response = await axios.get(`https://api.digitalocean.com/v2/droplets/${droplet_id}`, {
        headers: {
          Authorization: `Bearer ${process.env.DO_TOKEN}`,
        },
      });

  const ipAddress = response.data.droplet.networks.v4[0].ip_address;
  
  return ipAddress;
  
}

async function getSSHKeys() {
  try {
    const response = await axios.get('https://api.digitalocean.com/v2/account/keys', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DO_TOKEN}`
      }
    })

    const keysArray = response.data.ssh_keys.map(key => {
      return key.id
    })

    console.log('my ssh keys', keysArray);

    return keysArray;

  } catch (error) {
    console.log('Failed to get SSH keys', error.message);
  }


}

/**
 * Wait until a droplet is active on DigitalOcean
 */
async function waitUntilActive(dropletId) {
  return new Promise(resolve => {
    const interval = setInterval(async () => {
      const response = await axios.get(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
        headers: {
          Authorization: `Bearer ${process.env.DO_TOKEN}`,
        },
      });

      if (response.data.droplet.status === 'active') {
        clearInterval(interval);
        resolve();
      }
    }, 5000);
  });
}

async function scp(user, host, sshKey, srcPath, destPath) {
  const args = [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'IdentitiesOnly=yes',
      '-i',
      sshKey,
      srcPath,
      `${user}@${host}: ${destPath}`,
  ];

  return exec('scp', args);
}
module.exports = { createDroplet, waitUntilActive, getIPAddress, scp };
