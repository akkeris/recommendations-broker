const express = require('express');

const app = express();
const port = process.env.PORT || 9000;

// TODO: Expand this to include what tasks have run, how many times, last run, and so on

async function init(logger) {
  // Healthcheck
  app.get('/', (req, res) => {
    res.sendStatus(200);
  });

  // Send loaded services
  app.get('/services', (req, res) => {
    res.status(200).json(global.loadedServiceNames);
  });

  app.listen(port, () => {
    logger.debug(`Server listening on port ${port}`);
  });
}

module.exports = {
  init,
};
