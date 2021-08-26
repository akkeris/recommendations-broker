const { Signale } = require('signale');
const asyncPool = require('tiny-async-pool');

const globalUtils = require('../../../utils');
const turboUtils = require('../utils');

let akkerisPlans;
let turboCookie;

const cluster = process.env.KUBERNETES_CLUSTER_NAME;

const logger = new Signale({
  scope: 'getResizeActions',
  logLevel: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'debug',
});

async function getRecommendationsForAkkerisApp(app, space) {
  try {
    if (!akkerisPlans) {
      akkerisPlans = await globalUtils.getAkkerisPlans();
    }

    if (!turboCookie) {
      turboCookie = await turboUtils.getCookie();
    }

    // Get the workloadControllers that Turbonomic knows about for an app
    const appInfo = await turboUtils.searchForApp(app, space, cluster, turboCookie);

    // Get actions for each workloadController
    await globalUtils.asyncForEach(appInfo.workloadControllers, async (wc, index) => {
      appInfo.workloadControllers[index].actions = await turboUtils.getWorkloadControllerActions(wc.uuid, turboCookie);
    });

    // Map actions to plan sizes
    // Each workloadController will be updated with a summary containing the plan information
    appInfo.workloadControllers.forEach((wc, index) => {
      if (!wc.actions || wc.actions.length === 0) return;

      let action = wc.actions[0];

      // The following logic can be tweaked later:
      //    e.g. maybe choose smaller one if space compliance =/= prod
      //    ^ requires analyzing the "-prod" akkeris plans

      // If there are multiple actions (e.g. VMem & VMemRequest) choose the bigger one
      if (wc.actions.length > 1) {
        action = wc.actions.reduce((prev, curr) => ((prev.resizeToValue > curr.resizeToValue) ? prev : curr));
      }

      let resizeValue = Number(action.resizeToValue);
      if (action.valueUnits.toLowerCase() === 'kb') {
        resizeValue = Math.ceil(resizeValue / 1024);
      }

      const closestPlan = turboUtils.findClosestPlan(resizeValue, akkerisPlans);
      const currentPlan = action.target.tags['akkeris.io/plan'][0].split('-prod')[0];

      if (!closestPlan) {
        // Spit out a debug line so that we can go through and investigate plan sizes later
        logger.info(`Turbonomic is suggesting that the ${wc.formation} formation on ${app}-${space} be resized to a VMemLimit of ${resizeValue}, but there is no plan large enough to accommodate this request`);
        return;
      }

      appInfo.workloadControllers[index].suggestedPlan = closestPlan;

      if (closestPlan.name === currentPlan) {
        appInfo.workloadControllers[index].summary = null;
        return;
      }

      appInfo.workloadControllers[index].summary = {
        formation: wc.formation,
        from: currentPlan,
        to: closestPlan.name,
      };
    });

    // If no summary was added to any workloadController in the previous step
    // it means we did not find any actions that could be mapped to a change
    // in Akkeris plan size.
    if (appInfo.workloadControllers.filter((x) => !!x.summary).length === 0) {
      return null;
    }

    return {
      app: `${app}-${space}`,
      recommendations: appInfo.workloadControllers.filter((x) => !!x.summary).map((x) => ({
        formation: x.summary.formation,
        currentPlan: x.summary.from,
        newPlan: x.summary.to,
        actions: x.actions.map((y) => ({
          reason: y.risk.reasonCommodity,
          from: y.currentValue,
          to: y.resizeToValue,
          details: y.details,
        })),
      })),
    };
  } catch (err) {
    logger.error(err);
    return {
      app,
      error: err.message,
    };
  }
}

async function getResizeActions() {
  const recommendations = [];
  try {
    const apps = (await globalUtils.getAkkerisApps()).filter((app) => app.stack.name === process.env.AKKERIS_STACK_NAME);

    const processApp = async (app) => {
      const output = await getRecommendationsForAkkerisApp(app.simple_name, app.space.name);
      if (output !== null) {
        recommendations.push(output);
      }
    };

    await asyncPool(5, apps, processApp);

    logger.info(`Found ${recommendations.length} recommendations!`);
    logger.info('Apps:');
    recommendations.forEach((x) => {
      logger.info(`\t${x.app}`);
    });
  } catch (err) {
    logger.error(err);
  }
  return recommendations;
}

async function sendRecommendations(appSummary) {
  try {
    const { app } = appSummary;

    // Send each recommendation to the controller API
    await globalUtils.asyncForEach(appSummary.recommendations, async (recommendation) => {
      let action = recommendation.actions[0];

      // If there are multiple actions (e.g. VMem & VMemRequest) choose the bigger one
      if (recommendation.actions.length > 1) {
        action = recommendation.actions.reduce((prev, curr) => ((prev.to > curr.to) ? prev : curr));
      }

      const details = {
        description: `Resize ${recommendation.formation} from ${recommendation.currentPlan} to ${recommendation.newPlan} (${action.details})`,
        resource: recommendation.formation,
        plan: recommendation.newPlan,
      };

      await globalUtils.sendRecommendation(app, 'formation', 'resize', 'turbonomic', details);
      logger.info(`Sent recommendation for the ${recommendation.formation} formation on ${app}`);
    });
  } catch (err) {
    logger.error(err);
  }
}

(async () => {
  logger.debug('Starting getResizeActions job...');
  const appSummaries = await getResizeActions();
  await asyncPool(5, appSummaries, sendRecommendations);
  logger.debug('Finished getResizeActions job!');
})();
