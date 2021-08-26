const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Signale } = require('signale');

/* eslint-disable */
/**
 * Like Array.prototype.forEach but does await for each entry in the array
 * @param {Array} array 
 * @param {Function} callback 
 */
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}
/* eslint-enable */

/**
 * 'require' a given service and call its 'init' function
 */
async function loadService(serviceName, dir) {
  let service = {};
  try {
    // Make sure service has an 'index.js' file
    if ((await fs.promises.stat(path.join(dir, serviceName, 'index.js'))).isFile()) {
      try {
        // Require module, provide custom logger, and call the service's init function
        service = require(path.join(dir, serviceName, 'index.js'));
        service.logger = new Signale({
          scope: serviceName, logLevel: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug',
        });
        service.init();

        // Prepend full path to job filenames
        service.jobs.forEach((job, index) => {
          if (job.filename) {
            service.jobs[index].filename = path.join(dir, serviceName, 'jobs', job.filename);
          }
        });
      } catch (err) {
        // Unable to require & and initialize plugin
        console.error(err);
      }
    }
  } catch (err) {
    // Error when trying to stat the service directory
    console.error(err);
  }
  return service;
}

/**
 * Call loadService for each directory in the "services" directory
 */
async function loadServices(servicesDir) {
  const services = {};
  await asyncForEach((await fs.promises.readdir(servicesDir)), async (service) => {
    // If the 'service' file is a directory
    if ((await fs.promises.stat(path.join(servicesDir, service))).isDirectory()) {
      const serviceModule = await loadService(service, servicesDir);
      // If the service was successfully loaded, add it to the services object
      if (serviceModule && Object.keys(serviceModule).length > 0) {
        services[service] = serviceModule;
      }
    }
  });
  global.loadedServiceNames = Object.keys(services);
  return services;
}

/**
 * Verify all required environment variables are present
 */
async function verifyEnv() {
  if (!process.env.AKKERIS_APP_CONTROLLER) {
    module.exports.logger.fatal('Missing AKKERIS_APP_CONTROLLER environment variable!');
    process.exit(1);
  }

  if (!process.env.AKKERIS_SERVICE_TOKEN) {
    module.exports.logger.fatal('Missing AKKERIS_SERVICE_TOKEN environment variable!');
    process.exit(1);
  }
}

/**
 * Send a recommendation to the Akkeris Controller API
 * @param {string} app Name of target app (in "app-space" form)
 * @param {string} resourceType Name of target resource type (e.g. "formation")
 * @param {string} action Type of action to take (e.g. "resize")
 * @param {string} service Service providing the recommendation (e.g. "turbonomic")
 * @param {object} details Details of recommendation. Structure varies by action.
 */
async function sendRecommendation(app, resourceType, action, service, details) {
  try {
    await axios.post(
      `${process.env.AKKERIS_APP_CONTROLLER}/apps/${app}/recommendations`,
      {
        resource_type: resourceType, action, service, details,
      },
      { headers: { Authorization: `Bearer ${process.env.AKKERIS_SERVICE_TOKEN}` } },
    );
  } catch (err) {
    throw new Error(`Error sending recommendation to Akkeris: ${err.response.data ? err.response.data : err.message}`);
  }
}

/**
 * Get all formations for a given Akkeris app
 * @param {string} app Name of the target app
 * @param {string} space Name of the target app's space
 * @returns Array of formations
 */
async function getAkkerisAppFormations(app, space) {
  try {
    const { data: formations } = await axios.get(
      `${process.env.AKKERIS_APP_CONTROLLER}/apps/${app}-${space}/formation`,
      { headers: { Authorization: `Bearer ${process.env.AKKERIS_SERVICE_TOKEN}` } },
    );
    return formations;
  } catch (err) {
    throw new Error(`Error getting formation information from Akkeris: ${err.response.data ? err.response.data : err.message}`);
  }
}

/**
 * Retrieve available formation plans from the Akkeris Controller API
 * @returns An array of Akkeris plans
 */
async function getAkkerisPlans() {
  try {
    const { data: plans } = await axios.get(
      `${process.env.AKKERIS_APP_CONTROLLER}/sizes`,
      { headers: { Authorization: `Bearer ${process.env.AKKERIS_SERVICE_TOKEN}` } },
    );

    // Filter out 'prod' plans
    const availablePlans = plans.filter((x) => !x.deprecated && !x.name.includes('-prod'));

    // Sort plans by memory limits (ascending)
    availablePlans.sort((a, b) => a.resources.limits.memory.replace(/Mi/, '') - b.resources.limits.memory.replace(/Mi/, ''));

    return availablePlans;
  } catch (err) {
    throw new Error(`Error getting plan information from Akkeris: ${err.response.data ? err.response.data : err.message}`);
  }
}

/**
 * Retrieve available apps from the Akkeris Controller API
 * @returns An array of Akkeris apps
 */
async function getAkkerisApps() {
  try {
    const { data: apps } = await axios.get(
      `${process.env.AKKERIS_APP_CONTROLLER}/apps`,
      { headers: { Authorization: `Bearer ${process.env.AKKERIS_SERVICE_TOKEN}` } },
    );

    return apps;
  } catch (err) {
    throw new Error(`Error getting apps from Akkeris: ${err.response.data ? err.response.data : err.message}`);
  }
}

module.exports = {
  verifyEnv,
  loadServices,
  sendRecommendation,
  getAkkerisPlans,
  asyncForEach,
  getAkkerisApps,
  getAkkerisAppFormations,
};
