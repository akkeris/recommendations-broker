const axios = require('axios');
const qs = require('querystring');

const authEndpoint = `${process.env.TURBO_URL}/vmturbo/rest/login`;
const searchEndpoint = `${process.env.TURBO_URL}/api/v3/search`;
const entityActionsEndpoint = (uuid) => `${process.env.TURBO_URL}/api/v3/entities/${uuid}/actions`;

// Connect to Turbonomic and get an authorization cookie
async function getCookie() {
  const requestBody = {
    username: process.env.TURBO_USERNAME,
    password: process.env.TURBO_PASSWORD,
  };
  try {
    const response = await axios.post(authEndpoint, qs.stringify(requestBody));
    return response.headers['set-cookie'][0];
  } catch (err) {
    throw new Error(`Error authenticating to Turbonomic: ${err.message}`);
  }
}

function formatAppResults(app, space, data) {
  return {
    app,
    space,
    containerSpecs: data.map((wc) => wc.consumers.map((consumer) => ({
      uuid: consumer.uuid,
      name: consumer.displayName,
    }))).flat(),
    workloadControllers: data.map((wc) => ({
      uuid: wc.uuid,
      name: wc.displayName,
      formation: wc.formation,
    })),
  };
}

async function searchForApp(app, space, cluster, turboCookie) {
  const params = {
    regex: true,
    types: 'WorkloadController',
    probe_types: 'Kubernetes',
    q: `${app}(--.*)?`, // (--.*)? indicates include all formation types in the search
  };

  try {
    let { data: searchResults } = await axios.get(searchEndpoint, {
      params, headers: { Cookie: turboCookie },
    });

    // Filter by cluster
    searchResults = searchResults.filter((wc) => wc.discoveredBy.displayName === `Kubernetes-${cluster}`);

    // Filter by namespace
    searchResults = searchResults.filter((wc) => (
      wc.providers.find((provider) => provider.displayName === space)
    ));

    // Filter by formations
    searchResults = searchResults.reduce((acc, cur) => {
      const type = cur.displayName === app ? 'web' : cur.displayName.includes('--') ? cur.displayName.split('--')[1] : null; // eslint-disable-line
      if (type) { cur.formation = type; }
      acc.push(cur);
      return acc;
    }, []);

    return formatAppResults(app, space, searchResults);
  } catch (err) {
    console.log(err);
    throw new Error(`Error getting results from Turbonomic: ${err.message}`);
  }
}

async function getWorkloadControllerActions(uuid, turboCookie) {
  try {
    let { data: actions } = await axios.get(entityActionsEndpoint(uuid), { headers: { Cookie: turboCookie } });
    // Filter by VMEM recommendations as we don't reserve VCPU right now
    actions = actions.map((action) => (
      action.compoundActions.filter((ca) => ca.risk.reasonCommodity.toLowerCase().startsWith('vmem'))
    )).flat();
    return actions;
  } catch (err) {
    throw new Error(`Error getting recommendations from Turbonomic: ${err.message}`);
  }
}

// findClosestPlan will return the closest plan to the suggested memValue, or null if there is none
function findClosestPlan(memValue, plans) {
  const getPlanMemLimit = (plan) => Number(plan.resources.limits.memory.replace(/Mi/, ''));
  let closestPlan = plans.find((plan) => memValue === getPlanMemLimit(plan));
  if (!closestPlan) {
    closestPlan = plans.find((plan) => memValue < getPlanMemLimit(plan));
  }
  return closestPlan;
}

module.exports = {
  getCookie,
  searchForApp,
  getWorkloadControllerActions,
  findClosestPlan,
};
