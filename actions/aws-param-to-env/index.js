const core = require("@actions/core");
const aws = require("aws-sdk");
const ssm = new aws.SSM();

async function main() {
  try {
    console.log("Begin AWS Param To Env");
    const paramStoreBasePathInput = core.getInput("param-store-base-paths", {
      required: true,
    });
    const paramStoreBasePaths = paramStoreBasePathInput.split(",");
    for (const basePath of paramStoreBasePaths) {
      const parameters = await getParamsByPath(basePath);
      setParamsInEnvironment(basePath, parameters);
    }
    console.log("End AWS Param To Env");
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getParamsByPath(path) {
  const parameters = [];
  let ssmResult;
  let NextToken;

  do {
    ssmResult = await ssm
      .getParametersByPath({
        NextToken,
        Path: path,
        Recursive: true,
        WithDecryption: false, // anything important enough to be encrypted is left out, for now
      })
      .promise();

    if (ssmResult.Parameters.length) {
      parameters.push(...ssmResult.Parameters);
    }
    NextToken = ssmResult.NextToken;
  } while (NextToken);

  // careful with this, it appeats in the GITHUB logging
  console.log(`Loaded parameters: ${JSON.stringify(parameters)}`);

  return parameters;
}

/**
 * Convert the heirarchical param name to a unix-style param name.
 * e.g. /test/api/key -> API_KEY
 */
async function setParamsInEnvironment(path, params) {
  for (const param of params) {
    if (param.Type !== "SecureString") {
      const shortName = param.Name.replace(path, "");
      const unixName = shortName
        .replace(/^\//, "")
        .replace(/\//g, "_")
        .toUpperCase();
      process.env[unixName] = param.Value;
      console.log(
        `parameter loaded: ${shortName} :: ${unixName} -- ${param.Value}`
      );
    }
  }
}

main();
