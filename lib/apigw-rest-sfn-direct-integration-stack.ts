import * as cdk from "@aws-cdk/core";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";

export class APIGWRestSFNDirectIntegrationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const API = new apigw.RestApi(this, "API", {
      defaultCorsPreflightOptions: {
        /**
         * The allow rules are a bit relaxed.
         * I would strongly advise you to narrow them down in your applications.
         */
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: [],
        allowCredentials: true
      }
    });

    new cdk.CfnOutput(this, "APIEndpoint", {
      value: API.urlForPath("/create")
    });

    const APIOrchestratorMachine = new sfn.StateMachine(
      this,
      "APIOrchestratorMachine",
      {
        stateMachineType: sfn.StateMachineType.EXPRESS,
        definition: new sfn.Pass(this, "PassTask"),
        logs: {
          level: sfn.LogLevel.ALL,
          destination: new logs.LogGroup(this, "SFNLogGroup", {
            retention: logs.RetentionDays.ONE_DAY
          }),
          includeExecutionData: true
        }
      }
    );

    const invokeSFNAPIRole = new iam.Role(this, "invokeSFNAPIRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      inlinePolicies: {
        allowSFNInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["states:StartSyncExecution"],
              resources: [APIOrchestratorMachine.stateMachineArn]
            })
          ]
        })
      }
    });

    const createPetResource = API.root.addResource("create");
    createPetResource.addMethod(
      "POST",
      new apigw.Integration({
        type: apigw.IntegrationType.AWS,
        integrationHttpMethod: "POST",
        uri: `arn:aws:apigateway:${cdk.Aws.REGION}:states:action/StartSyncExecution`,
        options: {
          credentialsRole: invokeSFNAPIRole,
          passthroughBehavior: apigw.PassthroughBehavior.NEVER,
          requestTemplates: {
            "application/json": `{
              "input": "{\\"actionType\\": \\"create\\", \\"body\\": $util.escapeJavaScript($input.json('$'))}",
              "stateMachineArn": "${APIOrchestratorMachine.stateMachineArn}"
            }`
          },
          integrationResponses: [
            {
              selectionPattern: "200",
              statusCode: "201",
              responseTemplates: {
                "application/json": `
                  #set($inputRoot = $input.path('$'))

                  #if($input.path('$.status').toString().equals("FAILED"))
                    #set($context.responseOverride.status = 500)
                    {
                      "error": "$input.path('$.error')",
                      "cause": "$input.path('$.cause')"
                    }
                  #else
                    {
                      "id": "$context.requestId",
                      "output": "$util.escapeJavaScript($input.path('$.output'))"
                    }
                  #end
                `
              },
              responseParameters: {
                "method.response.header.Access-Control-Allow-Methods":
                  "'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'",
                "method.response.header.Access-Control-Allow-Headers":
                  "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
                "method.response.header.Access-Control-Allow-Origin": "'*'"
              }
            }
          ]
        }
      }),
      {
        methodResponses: [
          {
            statusCode: "201",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Methods": true,
              "method.response.header.Access-Control-Allow-Headers": true,
              "method.response.header.Access-Control-Allow-Origin": true
            }
          }
        ]
      }
    );
  }
}
