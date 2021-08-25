const path = require('path');
const Bree = require('bree');
const Cabin = require('cabin');
const { Signale } = require('signale');
const server = require('./server');
const utils = require('./utils');

utils.verifyEnv();

// Set up logger for Bree
const logger = new Signale({
  logLevel: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug',
});
const cabin = new Cabin({
  axe: { logger: logger.scope('bree'), showMeta: false, appInfo: false },
});

// Start web server
server.init(logger.scope('server'));

// Load service modules
const servicesDir = path.join(__dirname, 'services');

// Load each service and load jobs for each service into Bree
utils.loadServices(servicesDir).then((services) => {
  const jobs = Object.keys(services)
    .filter((serviceName) => Array.isArray(services[serviceName].jobs))
    .map((serviceName) => {
      const serviceJobs = services[serviceName].jobs.map((job) => ({
        name: `${serviceName}-${job.name.replace(/\s/g, '_')}`,
        path: job.filename,
        ...job.interval && { interval: job.interval },
        ...job.cron && { cron: job.cron },
        ...job.timeout && { timeout: job.timeout },
      }));
      return serviceJobs;
    })
    .flat();

  const bree = new Bree({ jobs, root: false, logger: cabin });
  bree.start();
});
