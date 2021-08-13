const execSync = require('child_process').execSync;
const core = require("@actions/core");
const aws = require("aws-sdk");
const ssm = new aws.SSM();

async function main() {
  try {
    console.log("Begin AWS Param To Env");

    const debuLogging = core.getInput("debug-logging");
    const decryptSecureStrings =
      core.getInput("decrypt-secure-strings") === "true";
    const paramStoreBasePathInput = core.getInput("param-store-base-paths", {
      required: true,
    });
    const paramStoreBasePaths = paramStoreBasePathInput.split(",");
    for (const basePath of paramStoreBasePaths) {
      const parameters = await getParamsByPath(basePath, decryptSecureStrings, debuLogging);
      setParamsInEnvironment(basePath, parameters);
    }
    
    console.log("End AWS Param To Env");
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getParamsByPath(path, decrypt, log) {
  const parameters = [];
  let ssmResult;
  let NextToken;

  do {
    if (log) {
      console.log(`Begin getParametersByPath: ${JSON.stringify(NextToken)}`);
    }

    ssmResult = await ssm
      .getParametersByPath({
        NextToken,
        Path: path,
        Recursive: true,
        WithDecryption: decrypt,
      })
      .promise();

    if (log) {
      console.log(`End getParametersByPath: ${JSON.stringify(ssmResult)}`);
    }

    if (ssmResult.Parameters.length) {
      parameters.push(...ssmResult.Parameters);
    }
    NextToken = ssmResult.NextToken;
  } while (NextToken);

  if (log) {
    console.log(`Loaded parameters: ${JSON.stringify(parameters)}`);
  }

  return parameters;
}

/**
 * Convert the heirarchical param name to a unix-style param name.
 * e.g. /test/api/key -> API_KEY
 */
async function setParamsInEnvironment(path, params) {
  for (const param of params) {
    const shortName = param.Name.replace(path, "");
    const unixName = shortName
      .replace(/^\//, "")
      .replace(/\//g, "_")
      .toUpperCase();

    // write the value into the github environment file
    const processCommand = `echo "${unixName}=${param.Value}" >> $GITHUB_ENV`;
    execSync(processCommand, {stdio: 'inherit'});
  }
}

main();
