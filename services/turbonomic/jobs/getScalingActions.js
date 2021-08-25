const { Signale } = require('signale');

const logger = new Signale({
  scope: 'getScalingActions',
  logLevel: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug',
});

async function spitOutABunchOfStuff() {
  await ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))(5000);
  logger.info('Wohohohoh I am a scaling job!');
}

(async () => {
  await spitOutABunchOfStuff();
  process.exit(0);
})();
