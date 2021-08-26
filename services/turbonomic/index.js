async function init() {
  if (!process.env.TURBO_USERNAME) {
    module.exports.logger.fatal('Missing TURBO_USERNAME environment variable!');
    process.exit(1);
  }

  if (!process.env.TURBO_PASSWORD) {
    module.exports.logger.fatal('Missing TURBO_PASSWORD environment variable!');
    process.exit(1);
  }

  if (!process.env.TURBO_URL) {
    module.exports.logger.fatal('Missing TURBO_URL environment variable!');
    process.exit(1);
  }

  if (!process.env.KUBERNETES_CLUSTER_NAME) {
    module.exports.logger.fatal('Missing KUBERNETES_CLUSTER_NAME environment variable!');
    process.exit(1);
  }

  if (!process.env.AKKERIS_STACK_NAME) {
    module.exports.logger.fatal('Missing AKKERIS_STACK_NAME environment variable!');
    process.exit(1);
  }

  module.exports.logger.debug('Turbonomic service loaded!');
}

module.exports = {
  init,
  jobs: [
    {
      name: 'Get Resize Actions',
      filename: 'getResizeActions.js',
      interval: '30m',
    },
  ],
  service: 'turbonomic',
};
