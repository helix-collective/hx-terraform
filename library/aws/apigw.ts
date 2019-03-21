import * as util from '../../library/util';
import * as AR from '../../providers/aws/resources';
import * as AT from '../../providers/aws/types';
import * as TF from '../../core/core';
import * as shared from "../../library/aws/shared";


/**
 * A structured definition of an AWS API gateway API.
 *
 * We can reduce a lot of boilerplate in terraform generation
 * with a heirarchical structure.
 */

export interface ApiParams {
  description: string;
  resources: ApiResourceParams[];
  customize?: util.Customize<AR.ApiGatewayRestApiParams>;
};

export interface ApiResourceParams {
  name: string;
  path_part: string;
  methods: ApiMethodParams[];
  customize?: util.Customize<AR.ApiGatewayResourceParams>;
};

export interface ApiMethodParams {
  http_method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'ANY';
  responses: ApiMethodResponseParams[];
  integration: ApiIntegrationParams;
  customize?: util.Customize<AR.ApiGatewayMethodParams>;
};

export interface ApiMethodResponseParams {
  status_code: string;
  integration: ApiIntegrationResponseParams;
  customize?: util.Customize<AR.ApiGatewayMethodResponseParams>;
};

export interface ApiIntegrationParams {
  type: 'HTTP' | 'MOCK' | 'AWS' | 'AWS_PROXY' | 'HTTP_PROXY';
  customize?: util.Customize<AR.ApiGatewayIntegrationParams>;
};

export interface ApiIntegrationResponseParams {
  customize?: util.Customize<AR.ApiGatewayIntegrationResponseParams>;
};

/**
 *  Construct a complete API gateway deployment from a structured definition
 */
export function createApi(tfgen: TF.Generator, name: string, apiParams: ApiParams): AR.ApiGatewayRestApi {
  const params = util.applyCustomize(apiParams.customize, {
      name: tfgen.scopedName(name).join("_"),
      description: apiParams.description,
  })
  const api = AR.createApiGatewayRestApi(tfgen, name, params);
  apiParams.resources.forEach( r => {
    const params = {
      rest_api_id: api.id,
      parent_id: api.root_resource_id,
      path_part: r.path_part,
    };
    util.applyCustomize(r.customize, params);
    const resource = AR.createApiGatewayResource(tfgen, name + "_" + r.name, params);
    r.methods.forEach( m => {
      const mname = [name, r.name, m.http_method].join("_");
      const params: AR.ApiGatewayMethodParams = {
        rest_api_id: api.id,
        resource_id: resource.id,
        http_method: m.http_method,
        authorization: "NONE"
        };
      util.applyCustomize(m.customize, params);
      const method = AR.createApiGatewayMethod(tfgen, mname, params);
      {
        const params: AR.ApiGatewayIntegrationParams = {
          rest_api_id: api.id,
          resource_id: resource.id,
          http_method: m.http_method,
          type: m.integration.type
        };
        util.applyCustomize(m.integration.customize, params);
        const integration = AR.createApiGatewayIntegration(tfgen, mname, params);
        tfgen.dependsOn(integration, method);
      }
      m.responses.forEach( mr => {
        const rname = [name, r.name, m.http_method, mr.status_code].join("_");
        const params: AR.ApiGatewayMethodResponseParams = {
          rest_api_id: api.id,
          resource_id: resource.id,
          http_method: m.http_method,
          status_code: mr.status_code,
          };
        util.applyCustomize(mr.customize, params);
        const response = AR.createApiGatewayMethodResponse(tfgen, rname, params);
        tfgen.dependsOn(response, method);
        {
          const params: AR.ApiGatewayIntegrationResponseParams = {
            rest_api_id: api.id,
            resource_id: resource.id,
            http_method: m.http_method,
            status_code: mr.status_code,
            };
          util.applyCustomize(mr.integration.customize, params);
          const integration_response = AR.createApiGatewayIntegrationResponse(tfgen, rname, params);
          tfgen.dependsOn(integration_response, response);
        }
      });
    });
  });

  return api;
}

/** Helper function for a OPTIONS method that enables CORS */
export function corsOptionsMethod() : ApiMethodParams {
  return {
    http_method: "OPTIONS",
    integration: {
      type: "MOCK",
      customize: c => {
        c.request_templates = {
          '"application/json"' : '{ "statusCode": 200 }'
        }
      }
    },
    responses: [
      {
        status_code: "200",
        customize: c => {
          c.response_models = {
            '"application/json"' : "Empty"
          }
          c.response_parameters = {
            '"method.response.header.Access-Control-Allow-Headers"' : "true",
            '"method.response.header.Access-Control-Allow-Methods"' : "true",
            '"method.response.header.Access-Control-Allow-Origin"' : "true"
          }
        },
        integration: {
          customize: c => {
            c.response_parameters = {
              '"method.response.header.Access-Control-Allow-Headers"' : "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              '"method.response.header.Access-Control-Allow-Methods"' : "'GET,OPTIONS,POST,PUT'",
              '"method.response.header.Access-Control-Allow-Origin"' : "'*'",
            }
          },
        },
      }
    ]
  };
}

/** Helper function for a POST method that calls the specified lambda function */
export function lambdaPostMethod(region: AT.Region, lambda: AR.LambdaFunction): ApiMethodParams {
  return {
    http_method: "POST",
    integration: {
      type: "AWS_PROXY",
      customize: (c) => {
        c.integration_http_method = "POST"
        c.uri = gatewayLambdaUri(region, lambda)
      }
    },
    responses: [
      {
        status_code: "200",
        integration: {}
      }
    ]
  };
}

export function gatewayLambdaUri(region: AT.Region, lambda: AR.LambdaFunction): string {
    return TF.rawExpr(`"arn:aws:apigateway:${region.value}:lambda:path/2015-03-31/functions/${lambda.arn.value}/invocations"`);
}
