# Recommendations Broker

The recommendations-broker collects recommendations from third-party services every so often and sends them to the controller-api with proper formatting.

## Usage

### Environment

The following environment variables need to be set:

| Environment Variable | Description | Required | Example | 
|-|-|-|-|
| AKKERIS_APP_CONTROLLER | Endpoint for the Akkeris api | **yes** | `https://apps.akkeris.io` |
| AKKERIS_SERVICE_TOKEN | Service token used for authenticating to Akkeris | **yes** | `ey...` |
| LOG_LEVEL | Change the default log level (`debug`) for more or less information | no | `info` |

**Turbonomic**

| Environment Variable | Description | Required | Example | 
|-|-|-|-|
| TURBO_USERNAME | Turbonomic username | **yes** | `svc-turbo-user` |
| TURBO_PASSWORD | Turbonomic password | **yes** | `hunter2` |
| TURBO_URL | URL of the Turbonomic instance | **yes** | `https://turbo.akkeris.io` |
| KUBERNETES_CLUSTER_NAME | Target Kubernetes cluster (currently only one supported) | **yes** | `ds1` |
| AKKERIS_STACK_NAME | Target Akkeris stack (currently only one supported) | **yes** | `ds1` |

### Running

```shell
npm install
npm start
```

Or:

```shell
docker build -t recommendations-broker .
docker run --rm --name recommendations-broker -p 9000:9000 recommendations-broker
```

*Note*:

The `DigiCertSHA2HighAssuranceServerCA.pem` file has been added to the `node.js` `EXTRA_CA_CERTS` environment variable in the `start` script because for some reason Turbonomic was not including it as an intermediary for our Turbonomic instance. YMMV

## TODO

**Turbonomic**

- Search for apps in multiple clusters

## Contributing

### Code Structure

The recommendations-broker is designed to be pluggable - it will run any job that is placed in the `services` folder provided that it follows a common convention (see [Adding a New Service](#adding-a-new-service) below)

The `index.js` entrypoint loads the web server (`server/index.js`, provides basic healthcheck / loaded service information) and all of the jobs in the `services` folder.

Helpful functions have been provided in the `utils.js` file, and are mostly functions to communicate with Akkeris.

### Adding a new service

This project uses a job scheduler called [Bree.js](https://github.com/breejs/bree) to run tasks. 

To add a new service that provides recommendations, create a new folder under the `services` directory with an `index.js` file exporting the following:

- An `init` function - can be used to set up services if needed
- A `service` string - containing the name of the service
- A `jobs` array - an array of objects consisting of:
  - `name` - Name of the job
  - `filename` - Filename of the job
  - `interval` - How often the job should run

The individual job files (referenced in the `jobs` array) should be placed in a `jobs` folder, which should be nested under the new service folder in the `services` directory.

For an example of this structure, take a look at the `services/turbonomic` directory.
